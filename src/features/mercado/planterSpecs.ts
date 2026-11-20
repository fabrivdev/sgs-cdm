import { coarseGrain, fineGrain, plantingSegment, unknownGrain, unknownPlantingSegment } from "./marketFamily";
import type { Movement, PlantingMovement } from "./model";
import { catalogLineOptions } from "./planterCatalog";

type PlanterSpec = {
  model: string;
  grain?: string;
  lines?: number;
  possibleLines?: readonly number[];
  transport?: string;
};

const maestroGVRows: Readonly<Record<string, number>> = {
  "22.81": 22, "24.76": 24, "30.60": 30, "32.55": 32,
  "36.50": 36, "39.45": 39, "40.45": 40,
};

function maestroGVSpec(brand: string, description: string): PlanterSpec | undefined {
  if (brand !== "HORSCH") return undefined;
  const match = description.match(/\bMAESTRO\s+(\d{2})[.,](\d{2})\s+GV\s*F\b/);
  // The confirmed Paraguayan 40.45 shipment was declared as GV ENG V.
  const config = match ? match[1] + "." + match[2]
    : /\bMAESTRO\s+40[.,]45\s+GV\b/.test(description) ? "40.45" : "";
  const lines = maestroGVRows[config];
  return lines ? { model: "MAESTRO " + config + " GV F", lines, grain: coarseGrain } : undefined;
}

function dakarCFSpec(description: string): PlanterSpec | undefined {
  const dakar = description.match(/\bDAKAR\s+(8|10)\s+CF\b/);
  if (!dakar) return undefined;
  const model = "DAKAR " + dakar[1] + " CF";
  return { model, grain: fineGrain, possibleLines: catalogLineOptions("HORSCH", model) };
}

export function completePlantingSegments(rows: Movement[]): Movement[] {
  return rows.map((row) => {
    if (row.length !== 14) return row;
    const spec = row[3] === "HORSCH"
      ? maestroGVSpec(row[3], row[4]) ?? dakarCFSpec(row[4])
      : undefined;
    if (!spec) return row;
    const updated: PlantingMovement = [...row];
    updated[4] = spec.model;
    updated[12] = row[12] === unknownGrain ? (spec.grain ?? unknownGrain) : row[12];
    updated[11] = row[11] ?? spec.lines ?? null;
    // A stored count outside the catalogue cannot describe this Dakar configuration.
    if (updated[11] != null && spec.possibleLines && !spec.possibleLines.includes(updated[11])) {
      updated[11] = null;
      updated[5] = unknownPlantingSegment;
    }
    if (updated[5] === unknownPlantingSegment) updated[5] = plantingSegment(updated[12], updated[11]);
    return updated;
  });
}

const spelledLines: Record<string, number> = {
  UN: 1, UMA: 1, UNA: 1, DOS: 2, DOIS: 2, DUAS: 2, TRES: 3,
  CUATRO: 4, QUATRO: 4, CINCO: 5, SEIS: 6, SIETE: 7, SETE: 7,
  OCHO: 8, OITO: 8, NUEVE: 9, NOVE: 9, DIEZ: 10, DEZ: 10,
};
const lineCountPattern = new RegExp(
  "\\b(\\d{1,3}|" + Object.keys(spelledLines).join("|") +
    ")\\s*(?:L\\s*INEAS?|L\\s+NEAS?|LINHAS?|SURCOS?|SULCOS?|HILERAS?|FILAS?|CUERPOS(?: DE SIEMBRA)?)\\b",
  "g",
);

export function plantingLines(description: string) {
  const reported = new Set(
    [...description.matchAll(lineCountPattern)]
      .map((hit) => spelledLines[hit[1]] ?? Number(hit[1]))
      .filter((n) => n > 0 && n <= 200),
  );
  return reported.size === 1 ? [...reported][0] : null;
}

export function planterSpec(brand: string, description: string): PlanterSpec | undefined {
  if (brand === "HORSCH") return maestroGVSpec(brand, description) ?? dakarCFSpec(description);
  const text = description.replace(/\bBIF FARM\b/g, "BIG FARM");
  if (brand === "FRAVI" || brand === "PLANTI CENTER") {
    const senior = text.match(/\bSFR\s*(19|23|27|31|35|39)\s*(?:SENIOR?|000)\b/);
    if (senior) return { model: "SFR " + senior[1] + " SENIOR", lines: Number(senior[1]), grain: fineGrain };
    const fragata = text.match(/\bFRAGATA\s+(1[2-9])\b/) ?? text.match(/\bT(1[2-9])FRAGATAG6/);
    if (fragata) return { model: "FRAGATA " + fragata[1], lines: Number(fragata[1]), grain: coarseGrain, transport: "Autotransportable" };
    const terracus = text.match(/\bTERRA[CÇ]U'?S\s+PREMIER\s+(9|1[0-7])\b/);
    if (terracus) return { model: "TERRACUS PREMIER " + terracus[1], lines: Number(terracus[1]), grain: coarseGrain };
    const farm = text.match(/\bBIG FARM\s+(13|15|17|19|21)(\s+AT)?\b/);
    if (farm) return { model: "BIG FARM " + farm[1] + (farm[2] ? " AT" : ""), grain: coarseGrain };
    const premier = text.match(/\bPREMIER\s+(\d{1,2})\s*\/\s*(\d{1,2})\b/);
    if (premier) return { model: "PREMIER " + premier[1] + "/" + premier[2], possibleLines: catalogLineOptions(brand, premier[0]), grain: coarseGrain };
  }
  if (brand === "TATU") {
    if (/\bMANIV\s+PHT\b/.test(text)) return { model: "MANIV PHT", lines: 2 };
    const sda = text.match(/\bSDA[-\s]?T\s+(17|19|23|25|29|33|37)\s*\/\s*(\d{2})\s*E\s*175\b/);
    if (sda) return { model: "SDA-T " + sda[2], lines: Number(sda[2]), grain: fineGrain };
    const hit = text.match(/\b(PST\s*(?:4|PLUS|DUO|TRIO)?(?:\s+FLEX)?(?:\s+SUPREMA)?)\s+(\d{1,2})(?:\s*\/\s*(\d{1,2}))?(?:\s*(E\s*\d{3}))?\b/);
    if (hit) {
      const family = hit[1].replace(/^PST\s*4/, "PST4").trim();
      return { model: family + " " + (hit[3] ?? hit[2]), lines: hit[4] ? Number(hit[3] ?? hit[2]) : undefined, grain: coarseGrain };
    }
  }
  if (brand === "STARA") {
    const series = text.match(/\b(PRINCESA|ESTRELA)(?:\s+(?:TOP|DPS))?\s+(\d{2}\s*[-/]\s*\d{2}|\d{2})\b/);
    if (series) return { model: series[0].replace(/\s*[-/]\s*/, "-"), grain: coarseGrain };
    const winter = text.match(/\bGUAPA\s+SUPRA\s+WINTER\s*(44|60)?\b/);
    if (winter) return { model: winter[0].trim(), grain: fineGrain, lines: winter[1] ? Number(winter[1]) : undefined, transport: "Autotransportable" };
  }
  if (brand === "VADERSTAD") {
    const tempo = text.match(/\bTEMPO\s+L\s+(?:TPL\s*)?(8|10|12|16|18|24|26|32)\b/);
    if (tempo) return { model: "TEMPO L " + tempo[1], grain: coarseGrain, lines: Number(tempo[1]) };
  }
  if (/^(?:VALTRA|FENDT|MASSEY FERGUSON)$/.test(brand)) {
    const momentum = text.match(/\bMOMENTUM\s+(18|20|22|24|30|40)\s*([FMV]\b)?\b/);
    if (momentum) return { model: "MOMENTUM " + momentum[1] + (momentum[2] ? " " + momentum[2] : ""), lines: Number(momentum[1]), grain: coarseGrain };
    if (brand === "VALTRA" && /\bHI\s*TECH\b/.test(text)) {
      const code = text.match(/\bCHAS(?:S)?I(?:S)?\s*[:.]?\s*9AGP(0?805|0?905|1005|1106|1206|1307|1508|1709)[A-Z0-9]+\b/)?.[1];
      const serial = text.match(/\bSERIE\s*[:.]?\s*H(08|09|10|11|12|13|15|17)\d+\b/)?.[1];
      const declared = text.match(/\bBP\s*(805|905|1005|1106|1206|1307|1508|1709)\b/)?.[1];
      // In this format the chassis carries the BP model code, corroborated by the serial prefix.
      const variant = declared ?? (code && serial === code.slice(0, -2) ? code.replace(/^0/, "") : undefined);
      return { model: variant ? "HITECH BP " + variant : "HITECH", lines: variant ? Number(variant.slice(0, -2)) : undefined, grain: coarseGrain };
    }
    if (brand === "MASSEY FERGUSON") {
      const mf = text.match(/\bMF\s*-?\s*(50[89]|51[0-357])\s*(X[HMP]?\b)?\b/);
      if (mf) {
        const model = "MF" + mf[1] + (mf[2] ?? "");
        return { model, grain: coarseGrain, possibleLines: catalogLineOptions(brand, model) };
      }
    }
  }
  if (brand === "BALDAN") {
    const compact = text.match(/\b(?:PLB|PBL)(?=\b|\d)/);
    if (compact) return { model: "PLB", grain: coarseGrain, possibleLines: [2, 3, 4, 5, 6, 7, 8] };
    const winter = text.match(/\bSKADI\s*5000(?:\s*SB)?\b/);
    if (winter) return { model: "SKADI 5000", grain: fineGrain, lines: 25 };
    const series = text.match(/\b(PPS(?:OLO)?|SPE|SPTG)\s*(\d{4})(?:SB(\d{1,2})P\d+|\b)/);
    if (series) {
      const configuration = text.match(/\bS(?:P)?EED BOX\s+\d{1,2}\s*\/\s*(\d{1,2})\b/);
      const model = series[1].replace("PPSOLO", "PPS") + " " + series[2];
      return { model, lines: configuration ? Number(configuration[1]) : undefined, grain: coarseGrain, possibleLines: catalogLineOptions(brand, model) };
    }
  }
  if (brand === "JOHN DEERE") {
    const jd = text.match(/\b(21(?:09|1[1357]|22|26|30|34)|31(?:19|23|27|31))(?:\s*FT|\s*VACU\w+)?\b/);
    if (jd) {
      const configuration = text.match(/\b(?:211[1357]|31(?:19|23|27|31))\s*-\s*(\d{1,2})\s*(?:L\b|LINEAS?\b)/);
      return { model: jd[1], grain: coarseGrain, lines: configuration ? Number(configuration[1]) : undefined, possibleLines: jd[1] === "2115" ? [13, 15] : jd[1] === "3127" ? [24, 27] : undefined };
    }
  }
  if (brand === "CASE IH") {
    const easyRiser = text.match(/\bEASY RISER\s+(32\d{2})\b/);
    if (easyRiser) return { model: "EASY RISER " + easyRiser[1], grain: coarseGrain };
  }
  if (brand === "KF") {
    const campeira = text.match(/\bTG\s+CAMPEIRA\s+(\d{2})\s*L\b/);
    if (campeira) return { model: "TG CAMPEIRA " + campeira[1] + "L", lines: Number(campeira[1]), grain: fineGrain };
  }
  if (brand === "IMASA") {
    const saga = text.match(/\bSAGA\s+PREMIUM\s+AT\s*(13|15|17|19)\b/);
    if (saga) return { model: "SAGA PREMIUM AT " + saga[1], grain: coarseGrain, lines: Number(saga[1]), transport: "Autotransportable" };
  }
  if (brand === "VENCE TUDO" && /\bPA\s*5000\b/.test(text)) {
    return { model: "PA 5000", grain: coarseGrain, possibleLines: [3, 4, 5] };
  }
  if (brand === "APV") {
    const pneumatic = text.match(/\bPS\s*(120|200|300|500|800|1600)\b/);
    if (pneumatic) return { model: "PS " + pneumatic[1] };
  }
}
