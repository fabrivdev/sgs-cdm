import { supabase } from "@/integrations/supabase/client";

export const PRESENCE_HEARTBEAT_MS = 45_000;
export const PRESENCE_WRITE_THROTTLE_MS = 35_000;
export const PRESENCE_RECENT_INTERACTION_MS = 120_000;
export const PRESENCE_ACTIVE_EXPIRES_MS = 90_000;
export const PRESENCE_DISCONNECTED_EXPIRES_MS = 10 * 60_000;

export type PresenceState = "active" | "inactive" | "disconnected";

export interface UserPresenceRow {
  user_id: string;
  last_activity_at: string;
  last_heartbeat_at: string;
  disconnected_at: string | null;
}

export interface PresenceSnapshot {
  state: PresenceState;
  lastActivityAt: Date | null;
}

const storageKey = (userId: string) => `sgs-presence-heartbeat:${userId}`;

export function presenceSnapshot(row: UserPresenceRow | undefined, now = Date.now()): PresenceSnapshot {
  if (!row) return { state: "disconnected", lastActivityAt: null };

  const activityAt = Date.parse(row.last_activity_at);
  const heartbeatAt = Date.parse(row.last_heartbeat_at);
  const disconnectedAt = row.disconnected_at ? Date.parse(row.disconnected_at) : Number.NEGATIVE_INFINITY;
  const explicitlyDisconnected = Number.isFinite(disconnectedAt) && disconnectedAt >= heartbeatAt;

  if (!explicitlyDisconnected && now - heartbeatAt <= PRESENCE_ACTIVE_EXPIRES_MS && now - activityAt <= PRESENCE_RECENT_INTERACTION_MS) {
    return { state: "active", lastActivityAt: new Date(activityAt) };
  }
  if (!explicitlyDisconnected && now - Math.max(heartbeatAt, activityAt) <= PRESENCE_DISCONNECTED_EXPIRES_MS) {
    return { state: "inactive", lastActivityAt: new Date(activityAt) };
  }
  return { state: "disconnected", lastActivityAt: new Date(activityAt) };
}

export function shouldHeartbeat(visible: boolean, lastInteractionAt: number, now = Date.now()) {
  return visible && now - lastInteractionAt <= PRESENCE_RECENT_INTERACTION_MS;
}

export function claimCrossTabHeartbeat(storage: Pick<Storage, "getItem" | "setItem">, userId: string, now = Date.now()) {
  const key = storageKey(userId);
  const previous = Number(storage.getItem(key));
  if (Number.isFinite(previous) && now - previous < PRESENCE_WRITE_THROTTLE_MS) return false;
  storage.setItem(key, String(now));
  return true;
}

async function sendPresence(interactedAt: number) {
  const timestamp = new Date(interactedAt).toISOString();
  const { error } = await supabase.rpc("touch_user_presence", {
    p_last_activity_at: timestamp,
  });
  if (error) throw error;
}

export function startUserPresence(userId: string, doc: Document = document, win: Window = window) {
  let lastInteractionAt = Date.now();
  let stopped = false;
  let writeInFlight = false;

  const attemptHeartbeat = async (force = false) => {
    const now = Date.now();
    if (stopped || writeInFlight || !shouldHeartbeat(doc.visibilityState === "visible", lastInteractionAt, now)) return;

    let claimed = force;
    try {
      claimed = claimed || claimCrossTabHeartbeat(win.localStorage, userId, now);
    } catch {
      // El almacenamiento puede estar bloqueado; el throttle local sigue limitando el intervalo.
      claimed = true;
    }
    if (!claimed) return;

    writeInFlight = true;
    try {
      await sendPresence(lastInteractionAt);
    } catch (error) {
      // La presencia es auxiliar: una falla de red nunca debe afectar el uso de la app.
      console.warn("Presence heartbeat failed", error);
    } finally {
      writeInFlight = false;
    }
  };

  const registerInteraction = () => {
    const wasIdle = !shouldHeartbeat(true, lastInteractionAt);
    lastInteractionAt = Date.now();
    if (wasIdle) void attemptHeartbeat();
  };
  const handleVisibility = () => {
    if (doc.visibilityState === "visible") {
      lastInteractionAt = Date.now();
      void attemptHeartbeat();
    }
  };

  const interactionEvents: (keyof DocumentEventMap)[] = ["pointerdown", "keydown", "touchstart", "scroll"];
  interactionEvents.forEach((eventName) => doc.addEventListener(eventName, registerInteraction, { passive: true }));
  doc.addEventListener("visibilitychange", handleVisibility);
  const intervalId = win.setInterval(() => void attemptHeartbeat(), PRESENCE_HEARTBEAT_MS);
  void attemptHeartbeat(true);

  return () => {
    stopped = true;
    win.clearInterval(intervalId);
    interactionEvents.forEach((eventName) => doc.removeEventListener(eventName, registerInteraction));
    doc.removeEventListener("visibilitychange", handleVisibility);
  };
}

export async function markUserDisconnected(userId: string) {
  try {
    const { error } = await supabase.rpc("disconnect_user_presence");
    if (error) throw error;
  } catch (error) {
    console.warn(`Presence disconnect failed for ${userId}`, error);
  }
}
