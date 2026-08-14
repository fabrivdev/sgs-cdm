import React, { Component, Suspense, useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import "./offline-experience.css";

type LanyardModule = typeof import("@/components/Lanyard");

let lanyardModule: LanyardModule | null = null;
let lanyardReadyPromise: Promise<boolean> | null = null;
let lanyardFailed = false;

const CARD_IMAGES = ["/offline-card.svg", "/offline-lanyard.svg", "/sig-cdm-logo.png"];

function preloadImage(src: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(src));
    image.src = src;
  });
}

// Warm up the heavy 3D runtime and its assets while the network is available.
// Any failure is contained here: the offline card then falls back to the
// static credential instead of bubbling up to the global ErrorBoundary.
function ensureLanyardReady(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (lanyardFailed) return Promise.resolve(false);
  if (!lanyardReadyPromise) {
    lanyardReadyPromise = Promise.all([
      import("@/components/Lanyard").then((mod) => {
        lanyardModule = mod;
      }),
      ...CARD_IMAGES.map(preloadImage),
    ])
      .then(() => true)
      .catch(() => {
        lanyardFailed = true;
        lanyardReadyPromise = null;
        return false;
      });
  }
  return lanyardReadyPromise;
}

if (typeof window !== "undefined") {
  void ensureLanyardReady();
  window.addEventListener("online", () => {
    lanyardFailed = false;
    void ensureLanyardReady();
  });
}

const hasWebGL = () => {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
};

class Lanyard3DBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    lanyardFailed = true;
    return { failed: true };
  }

  componentDidCatch() {
    // Contained on purpose: the offline screen must never surface the global error view.
  }

  render() {
    if (this.state.failed) return <StaticCredential />;
    return this.props.children;
  }
}

export function OfflineExperience() {
  const [showMotion, setShowMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      if (reducedMotion.matches || !hasWebGL()) {
        if (!cancelled) setShowMotion(false);
        return;
      }
      void ensureLanyardReady().then((ready) => {
        if (!cancelled) setShowMotion(ready);
      });
    };
    update();
    reducedMotion.addEventListener("change", update);
    return () => {
      cancelled = true;
      reducedMotion.removeEventListener("change", update);
    };
  }, []);

  const Lanyard = lanyardModule?.default;

  return (
    <section className="offline-experience" role="alert" aria-live="assertive">
      <div className="offline-glow offline-glow-one" />
      <div className="offline-glow offline-glow-two" />
      <h1 className="sr-only">Sin conexión a internet</h1>
      <p className="sr-only">La aplicación se reanudará automáticamente cuando vuelva internet.</p>
      <div className="offline-lanyard-stage" aria-hidden="true">
        {showMotion && Lanyard ? (
          <Lanyard3DBoundary>
            <Suspense fallback={<StaticCredential />}>
              <Lanyard position={[0, 0, 13]} gravity={[0, -40, 0]} fov={22} frontImage="/offline-card.svg" backImage="/offline-card.svg" imageFit="cover" lanyardImage="/offline-lanyard.svg" logoImage="/sig-cdm-logo.png" lanyardWidth={0.58} />
            </Suspense>
          </Lanyard3DBoundary>
        ) : (
          <StaticCredential />
        )}
      </div>
      <div className="offline-waiting"><WifiOff aria-hidden="true" /><span>Esperando reconexión</span><i aria-hidden="true" /></div>
    </section>
  );
}

function StaticCredential() {
  return (
    <div className="offline-static-wrap">
      <span className="offline-static-strap" />
      <div className="offline-static-card">
        <span className="offline-static-clip" />
        <img src="/sig-cdm-logo.png" alt="" />
        <span className="offline-static-brand">SIG · CDM</span>
        <span className="offline-static-rule" />
        <strong>SIN CONEXIÓN<br />A INTERNET</strong>
        <em>Esperando reconexión automática</em>
        <span className="offline-static-tag">EL MAÑANA ES HOY</span>
      </div>
    </div>
  );
}
