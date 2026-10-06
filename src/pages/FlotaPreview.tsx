import { FLEET_PREVIEW_SNAPSHOT } from "@/features/fleet/previewData";
import { AppLayout } from "@/components/AppLayout";
import Flota from "./Flota";

export default function FlotaPreview() {
  return <AppLayout preview={{ modulo: "servicios", profileName: "Fabrizio (DEMO)", levelLabel: "Servicios" }}>
    <Flota previewData={FLEET_PREVIEW_SNAPSHOT} />
  </AppLayout>;
}
