import { lazy, Suspense, useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import "./offline-experience.css";

const loadLanyard = () => import("@/components/Lanyard");
const Lanyard = lazy(loadLanyard);

// Start downloading the heavier 3D runtime without blocking the application.
// If the connection drops first, Suspense immediately keeps the static card.
void loadLanyard();
if (typeof window !== "undefined") {
  ["/offline-card.svg", "/offline-lanyard.svg", "/sig-cdm-logo.png"].forEach((src) => {
    const image = new Image();
    image.src = src;
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

export function OfflineExperience() {
  const [showMotion, setShowMotion] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setShowMotion(!reducedMotion.matches && hasWebGL());
    update();
    reducedMotion.addEventListener("change", update);
    return () => reducedMotion.removeEventListener("change", update);
  }, []);

  return (
    <section className="offline-experience" role="alert" aria-live="assertive">
      <div className="offline-glow offline-glow-one" />
      <div className="offline-glow offline-glow-two" />
      <h1 className="sr-only">Sin conexión a internet</h1>
      <p className="sr-only">La aplicación se reanudará automáticamente cuando vuelva internet.</p>
      <div className="offline-lanyard-stage" aria-hidden="true">
        {showMotion ? (
          <Suspense fallback={<StaticCredential />}>
            <Lanyard position={[0, 0, 13]} gravity={[0, -40, 0]} fov={22} frontImage="/offline-card.svg" backImage="/offline-card.svg" imageFit="cover" lanyardImage="/offline-lanyard.svg" logoImage="/sig-cdm-logo.png" lanyardWidth={0.58} />
          </Suspense>
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
    <div className="offline-static-card">
      <img src="/sig-cdm-logo.png" alt="" />
      <strong>SIN CONEXIÓN<br />A INTERNET</strong>
      <span>SIG · CDM</span>
    </div>
  );
}
