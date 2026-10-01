import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc },
}));

import {
  PRESENCE_ACTIVE_EXPIRES_MS,
  PRESENCE_DISCONNECTED_EXPIRES_MS,
  claimCrossTabHeartbeat,
  markUserDisconnected,
  presenceSnapshot,
  shouldHeartbeat,
  type UserPresenceRow,
} from "./userPresence";

const now = Date.parse("2026-10-01T12:00:00.000Z");
const isoAgo = (milliseconds: number) => new Date(now - milliseconds).toISOString();

const row = (overrides: Partial<UserPresenceRow> = {}): UserPresenceRow => ({
  user_id: "11111111-1111-4111-8111-111111111111",
  last_activity_at: isoAgo(30_000),
  last_heartbeat_at: isoAgo(30_000),
  disconnected_at: null,
  ...overrides,
});

describe("user presence", () => {
  beforeEach(() => rpc.mockReset());

  it("does not equate a stored login with active use", () => {
    expect(presenceSnapshot(undefined, now).state).toBe("disconnected");
    expect(presenceSnapshot(row(), now).state).toBe("active");
    expect(presenceSnapshot(row({ last_activity_at: isoAgo(3 * 60_000) }), now).state).toBe("inactive");
    expect(presenceSnapshot(row({
      last_activity_at: isoAgo(PRESENCE_DISCONNECTED_EXPIRES_MS + 1),
      last_heartbeat_at: isoAgo(PRESENCE_DISCONNECTED_EXPIRES_MS + 1),
    }), now).state).toBe("disconnected");
  });

  it("expires active state and honors an explicit logout", () => {
    expect(presenceSnapshot(row({ last_heartbeat_at: isoAgo(PRESENCE_ACTIVE_EXPIRES_MS + 1) }), now).state).toBe("inactive");
    expect(presenceSnapshot(row({ disconnected_at: isoAgo(10_000) }), now).state).toBe("disconnected");
  });

  it("only heartbeats while visible and recently used", () => {
    expect(shouldHeartbeat(true, now - 30_000, now)).toBe(true);
    expect(shouldHeartbeat(false, now - 30_000, now)).toBe(false);
    expect(shouldHeartbeat(true, now - 3 * 60_000, now)).toBe(false);
  });

  it("throttles multiple tabs through shared storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(claimCrossTabHeartbeat(storage, row().user_id, now)).toBe(true);
    expect(claimCrossTabHeartbeat(storage, row().user_id, now + 10_000)).toBe(false);
    expect(claimCrossTabHeartbeat(storage, row().user_id, now + 40_000)).toBe(true);
  });

  it("keeps logout usable when the presence request fails", async () => {
    rpc.mockResolvedValue({ error: new Error("offline") });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(markUserDisconnected(row().user_id)).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
});
