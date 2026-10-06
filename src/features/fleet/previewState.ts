import type { FleetPreviewSnapshot } from "./previewData";

export function cloneFleetPreviewSnapshot(snapshot: FleetPreviewSnapshot): FleetPreviewSnapshot {
  return {
    vehicles: snapshot.vehicles.map((row) => ({ ...row })),
    readings: snapshot.readings.map((row) => ({ ...row })),
    responsibleCandidates: snapshot.responsibleCandidates.map((row) => ({ ...row })),
    responsibilityEvents: snapshot.responsibilityEvents.map((row) => ({ ...row })),
  };
}
