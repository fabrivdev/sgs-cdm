import type { FleetVehicle } from "./model";

export interface FleetVehicleReferenceImage {
  imageUrl: string;
  sourceUrl: string;
  author: string;
  license: "CC BY-SA 2.0" | "CC BY-SA 4.0";
  licenseUrl: string;
  label: string;
  alt: string;
}

const LICENSE_2_URL = "https://creativecommons.org/licenses/by-sa/2.0/";
const LICENSE_4_URL = "https://creativecommons.org/licenses/by-sa/4.0/";

const MAXUS_T60_DOUBLE_CAB: FleetVehicleReferenceImage = {
  imageUrl: "https://upload.wikimedia.org/wikipedia/commons/8/83/2022_Maxus_T60_GLX_D20.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:2022_Maxus_T60_GLX_D20.jpg",
  author: "RL GNZLZ",
  license: "CC BY-SA 2.0",
  licenseUrl: LICENSE_2_URL,
  label: "T60 doble cabina · referencial",
  alt: "Imagen referencial de una Maxus T60 doble cabina",
};

const MITSUBISHI_L200_DOUBLE_CAB: FleetVehicleReferenceImage = {
  imageUrl: "https://upload.wikimedia.org/wikipedia/commons/2/2d/2019_Mitsubishi_L200_Katana_CR.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:2019_Mitsubishi_L200_Katana_CR.jpg",
  author: "RL GNZLZ",
  license: "CC BY-SA 2.0",
  licenseUrl: LICENSE_2_URL,
  label: "L200 doble cabina · referencial",
  alt: "Imagen referencial de una Mitsubishi L200 doble cabina",
};

const DMAX_SINGLE_CAB: FleetVehicleReferenceImage = {
  imageUrl: "https://upload.wikimedia.org/wikipedia/commons/6/6f/2019_Isuzu_D-Max_Spark_1.9_Ddi_S.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:2019_Isuzu_D-Max_Spark_1.9_Ddi_S.jpg",
  author: "Chanokchon",
  license: "CC BY-SA 4.0",
  licenseUrl: LICENSE_4_URL,
  label: "D-Max cabina simple · referencial",
  alt: "Imagen referencial de un Isuzu D-Max cabina simple",
};

const DMAX_2023_DOUBLE_CAB: FleetVehicleReferenceImage = {
  imageUrl: "https://upload.wikimedia.org/wikipedia/commons/c/cc/2023_Isuzu_D-Max_Cab4_1.9_Ddi_L.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:2023_Isuzu_D-Max_Cab4_1.9_Ddi_L.jpg",
  author: "Chanokchon",
  license: "CC BY-SA 4.0",
  licenseUrl: LICENSE_4_URL,
  label: "D-Max doble cabina · referencial",
  alt: "Imagen referencial de un Isuzu D-Max doble cabina",
};

const DMAX_FACELIFT_DOUBLE_CAB: FleetVehicleReferenceImage = {
  imageUrl: "https://upload.wikimedia.org/wikipedia/commons/0/04/2025_Isuzu_D-Max_3.0_LS-A_in_Splash_White%2C_07-19-2024.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:2025_Isuzu_D-Max_3.0_LS-A_in_Splash_White,_07-19-2024.jpg",
  author: "Ethan Llamas",
  license: "CC BY-SA 4.0",
  licenseUrl: LICENSE_4_URL,
  label: "D-Max doble cabina · referencial",
  alt: "Imagen referencial de un Isuzu D-Max doble cabina de tercera generación",
};

function normalized(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

/**
 * Catálogo deliberadamente estricto: muestra una foto de familia y carrocería,
 * no una foto del vehículo real ni una afirmación de variante exacta.
 */
export function fleetVehicleReferenceImage(vehicle: FleetVehicle): FleetVehicleReferenceImage | null {
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
  if (vehicle.model_year === 2025 || vehicle.model_year === 2026) return DMAX_FACELIFT_DOUBLE_CAB;
  return null;
}
