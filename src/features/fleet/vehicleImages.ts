import type { FleetVehicle } from "./model";

export interface FleetVehicleImage {
  imageUrl: string;
  alt: string;
}

const MAXUS_T60_DOUBLE_CAB: FleetVehicleImage = {
  imageUrl: "/fleet/maxus-t60-2023-white-basic.png",
  alt: "Camioneta blanca MAXUS T60 de doble cabina y configuración básica",
};

const MITSUBISHI_L200_DOUBLE_CAB: FleetVehicleImage = {
  imageUrl: "/fleet/mitsubishi-l200-2023-white-basic.png",
  alt: "Camioneta blanca Mitsubishi L200 de doble cabina y configuración básica",
};

const DMAX_SINGLE_CAB: FleetVehicleImage = {
  imageUrl: "/fleet/isuzu-dmax-2023-singlecab-white-basic.png",
  alt: "Camioneta blanca Isuzu D-Max de cabina simple y configuración básica",
};

const DMAX_2023_DOUBLE_CAB: FleetVehicleImage = {
  imageUrl: "/fleet/isuzu-dmax-2023-doublecab-white-basic.png",
  alt: "Camioneta blanca Isuzu D-Max de doble cabina y configuración básica",
};

const DMAX_2025_2026_DOUBLE_CAB: FleetVehicleImage = {
  imageUrl: "/fleet/isuzu-dmax-2025-2026-doublecab-white-basic.png",
  alt: "Camioneta blanca Isuzu D-Max de doble cabina y configuración básica",
};

function normalized(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

/** Catálogo estricto por familia, año conocido y carrocería. */
export function fleetVehicleReferenceImage(vehicle: FleetVehicle): FleetVehicleImage | null {
  const brand = normalized(vehicle.brand);
  const model = normalized(vehicle.model);

  if (brand === "MAXUS" && model === "T60 CONFORT 4X4" && vehicle.model_year === 2023) {
    return MAXUS_T60_DOUBLE_CAB;
  }
  if (brand === "MITSUBISHI" && model === "L200 TRITON SPORT GL 4X4" && vehicle.model_year === 2023) {
    return MITSUBISHI_L200_DOUBLE_CAB;
  }
  if (brand !== "ISUZU") return null;
  if (model === "D-MAX 4X4 C/S" && vehicle.model_year === 2023) return DMAX_SINGLE_CAB;
  if (model !== "D-MAX") return null;
  if (vehicle.model_year === 2023) return DMAX_2023_DOUBLE_CAB;
  if (vehicle.model_year === 2025 || vehicle.model_year === 2026) return DMAX_2025_2026_DOUBLE_CAB;
  return null;
}
