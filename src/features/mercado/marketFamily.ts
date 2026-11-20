import { harvestClasses, harvestPriceBands, unknownHarvestClass } from "./model";
import { hpBands } from "./marketAnalysis";

export type MarketFamily = "tractores" | "cosechadoras" | "sembradoras";

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
const plantingSummary = [
  { label: "Hasta 14 líneas", bands: coarseSegments.slice(0, 3) },
  { label: "15–18 líneas", bands: coarseSegments.slice(3, 5) },
  { label: "19 líneas o más", bands: coarseSegments.slice(5) },
  { label: "Hasta 29 surcos", bands: fineSegments.slice(0, 3) },
  { label: "30 surcos o más", bands: fineSegments.slice(3) },
];
const plantingSummaryByBand = new Map<string, string>(
  plantingSummary.flatMap(({ label, bands }) => bands.map((band) => [band, label] as const)),
);
export const plantingSummaryOrder = plantingSummary.map(({ label }) => label);
export function plantingSummaryBand(band: string) {
  return plantingSummaryByBand.get(band) ?? unknownPlantingSegment;
}

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
  const index = (fine ? [20, 24, 29, 33, 37] : [10, 12, 14, 16, 18, 21, 23, 27])
    .findIndex((upper) => count <= upper);
  return labels[index < 0 ? labels.length - 1 : index];
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
  sembradoras: { title:"Sembradoras", table:"mercado_sembradoras", machine:"sembradora",
    benchmark:"HORSCH", segmentRoute:"segmentos", segmentTab:"Segmentos",
    segmentHeader:"Líneas o surcos", segmentName:"segmento", segments:[...coarseSegments,...fineSegments],
    unknownSegment:unknownPlantingSegment, prices:plantingPriceBands,
  },
} as const;
export const plantingFilters = [
  {key:"grano", label:"Tipo de grano", field:12},
  {key:"transporte", label:"Transporte", field:13},
] as const;
