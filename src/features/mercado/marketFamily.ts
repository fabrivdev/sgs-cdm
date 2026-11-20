import { harvestClasses, harvestPriceBands, unknownHarvestClass, type Movement } from "./model";
import { hpBands } from "./marketAnalysis";
import { catalogLineOptions } from "./planterCatalog";

export type MarketFamily = "tractores" | "cosechadoras" | "sembradoras" | "pulverizadores";

export const coarseGrain = "Grano grueso";
export const fineGrain = "Grano fino";
export const mixedGrain = "Mixta";
export const unknownGrain = "Sin tipo informado";
export const unknownTransport = "Sin transporte informado";
export const unknownPlantingSegment = "Sin segmento informado";

const coarseSegments = [
  "Hasta 10 líneas", "11–12 líneas", "13–14 líneas", "15–16 líneas",
  "17–18 líneas", "19–21 líneas", "22–23 líneas", "24–27 líneas", "Más de 27 líneas",
];
const fineSegments = [
  "Hasta 20 surcos", "21–24 surcos", "25–29 surcos", "30–33 surcos",
  "34–37 surcos", "Más de 37 surcos",
];
const coarseUpper = [10, 12, 14, 16, 18, 21, 23, 27];
const fineUpper = [20, 24, 29, 33, 37];
const plantingSummary = [
  { label: "Hasta 14 líneas", upper: 14 },
  { label: "15–18 líneas", upper: 18 },
  { label: "19–24 líneas", upper: 24 },
  { label: "25–29 líneas", upper: 29 },
  { label: "30 líneas o más", upper: Infinity },
];
const plantingSummaryOrder = plantingSummary.map(({ label }) => label);
const bandAt = (lines: number) => plantingSummary.find(({ upper }) => lines <= upper)?.label;

const storedPlantingBands = new Map(
  ([[coarseSegments, coarseUpper], [fineSegments, fineUpper]] as const).flatMap(([bands, bounds]) =>
    bands.map((band, i) => [
      band, [(bounds[i - 1] ?? 0) + 1, bounds[i] ?? Infinity],
    ] as const),
  ),
);
export function plantingSummaryBand(row: Movement) {
  if (row[11] != null) return bandAt(row[11]) ?? unknownPlantingSegment;
  const options = catalogLineOptions(row[3], row[4]);
  const bounds = options ? [Math.min(...options), Math.max(...options)] : storedPlantingBands.get(row[5]);
  if (bounds && bandAt(bounds[0]) === bandAt(bounds[1])) {
    return bandAt(bounds[0]) ?? unknownPlantingSegment;
  }
  return unknownPlantingSegment;
}

export const plantingImportSegments = [...coarseSegments, ...fineSegments];
export const plantingPriceBands = [
  "Menos de $25.000", "$25.000 a <$50.000", "$50.000 a <$100.000",
  "$100.000 a <$200.000", "$200.000 o más",
];
export function plantingPriceBand(value: number) {
  if (value <= 0) return "Sin FOB positivo";
  const index = [25_000, 50_000, 100_000, 200_000].findIndex((bound) => value < bound);
  return plantingPriceBands[index < 0 ? plantingPriceBands.length - 1 : index];
}
export function plantingSegment(grain: string, count: number | null) {
  if (count === null || (grain !== coarseGrain && grain !== fineGrain))
    return unknownPlantingSegment;
  const fine = grain === fineGrain;
  const labels = fine ? fineSegments : coarseSegments;
  const index = (fine ? fineUpper : coarseUpper)
    .findIndex((upper) => count <= upper);
  return labels[index < 0 ? labels.length - 1 : index];
}
export const unknownSprayerTank = "Sin tanque informado";
export const unknownSprayerBoom = "Sin barra informada";
export const unknownSprayerPower = "Sin HP informado";
const tankBands = ["Hasta 2.000 l", "2.001–2.500 l", "2.501–3.500 l", "3.501–4.500 l", "Más de 4.500 l"];
const boomBands = ["Hasta 27 m", "Más de 27 a 36 m", "Más de 36 m"];
const powerBands = ["Hasta 150 HP", "151–220 HP", "221–280 HP", "Más de 280 HP"];
const sprayerPrices = ["Menos de $100.000", "$100.000 a <$150.000", "$150.000 a <$200.000", "$200.000 a <$300.000", "$300.000 o más"];
export function sprayerTankBand(litres: number | null) {
  if (litres === null) return unknownSprayerTank;
  return tankBands[[2000, 2500, 3500, 4500, Infinity].findIndex((upper) => litres <= upper)];
}
export function sprayerBoomBand(width: number) {
  return boomBands[[27, 36, Infinity].findIndex((upper) => width <= upper)];
}
export function sprayerPowerBand(hp: number | null) {
  if (hp === null) return unknownSprayerPower;
  return powerBands[[150, 220, 280, Infinity].findIndex((upper) => hp <= upper)];
}
export function sprayerPriceBand(fob: number) {
  if (fob <= 0) return "Sin FOB positivo";
  return sprayerPrices[[100_000, 150_000, 200_000, 300_000, Infinity].findIndex((upper) => fob < upper)];
}

export const marketFamilies = {
  tractores: { title:"Tractores", table:"mercado_tractores", machine:"tractor",
    benchmark:"CLAAS", segmentRoute:"potencia", segmentTab:"Potencia HP",
    segmentHeader:"Banda HP", segmentName:"potencia", segments:hpBands,
    unknownSegment:"Sin potencia informada",
    prices:["Menos de USD 25.000","USD 25.000 a <50.000","USD 50.000 a <100.000",
      "USD 100.000 a <150.000","USD 150.000 o más"],
  },
  cosechadoras: { title:"Cosechadoras", table:"mercado_cosechadoras", machine:"cosechadora",
    benchmark:"CLAAS", segmentRoute:"clases", segmentTab:"Clases",
    segmentHeader:"Clase", segmentName:"clase", segments:harvestClasses,
    unknownSegment:unknownHarvestClass, prices:harvestPriceBands,
  },
  pulverizadores: { title:"Pulverizadores", table:"mercado_pulverizadores", machine:"pulverizador",
    benchmark:"HORSCH", segmentRoute:"tanques", segmentTab:"Tanques",
    segmentHeader:"Capacidad del tanque", segmentName:"tanque", segments:tankBands,
    unknownSegment:unknownSprayerTank, prices:sprayerPrices,
  },
  sembradoras: { title:"Sembradoras", table:"mercado_sembradoras", machine:"sembradora",
    benchmark:"HORSCH", segmentRoute:"segmentos", segmentTab:"Segmentos",
    segmentHeader:"Líneas de siembra", segmentName:"segmento", segments:plantingSummaryOrder,
    unknownSegment:unknownPlantingSegment, prices:plantingPriceBands,
  },
} as const;
export const plantingFilters = [
  {key:"grano", label:"Tipo de grano", field:12},
  {key:"transporte", label:"Transporte", field:13},
] as const;
export const sprayerFilters = [
  {key:"barra", label:"Ancho de barra", field:12},
  {key:"hp", label:"Potencia HP", field:13},
] as const;
