import type { Marca } from "@/lib/constants";

export type TipoTiempoFacturacion = "Cliente" | "Garantia" | "Interno";
export type GrupoNormalizadoFacturacion = "Servicio" | "Repuestos" | "Kilometraje" | "Maquinarias" | "Otros";

export interface FacturacionGrupoRegla {
  grupo: string;
  grupoNormalizado: GrupoNormalizadoFacturacion;
  marca: Marca;
}

export const FACTURACION_GRUPO_REGLAS: FacturacionGrupoRegla[] = [
  { grupo: "002 - PICADORAS", grupoNormalizado: "Maquinarias", marca: "CLAAS" },
  { grupo: "SERVICE - CLAAS", grupoNormalizado: "Servicio", marca: "CLAAS" },
  { grupo: "REPUESTOS - CLAAS", grupoNormalizado: "Repuestos", marca: "CLAAS" },
  { grupo: "REPUESTOS CLAAS - PROMOCION", grupoNormalizado: "Repuestos", marca: "CLAAS" },
  { grupo: "REPUESTOS - CABEZALES/PLATAFOR", grupoNormalizado: "Repuestos", marca: "CLAAS" },
  { grupo: "REPUESTOS TRACTOR", grupoNormalizado: "Repuestos", marca: "CLAAS" },
  { grupo: "REPUESTOS DIVERSOS --", grupoNormalizado: "Repuestos", marca: "CLAAS" },
  { grupo: "SERVICE - HORSCH", grupoNormalizado: "Servicio", marca: "HORSCH" },
  { grupo: "REPUESTOS PLANTADORA", grupoNormalizado: "Repuestos", marca: "HORSCH" },
  { grupo: "REPUESTOS PULVERIZADORAS", grupoNormalizado: "Repuestos", marca: "HORSCH" },
  { grupo: "SERVICIOS - OTROS", grupoNormalizado: "Servicio", marca: "OTROS" },
  { grupo: "REPUESTOS - RIEGO", grupoNormalizado: "Repuestos", marca: "OTROS" },
  { grupo: "OTROS PRODUCTOS", grupoNormalizado: "Otros", marca: "OTROS" },
  { grupo: "REPUESTOS USADO", grupoNormalizado: "Repuestos", marca: "OTROS" },
  { grupo: "ACCESORIOS DIVERSOS", grupoNormalizado: "Otros", marca: "OTROS" },
  { grupo: "REPUESTOS - ENROLLADORES", grupoNormalizado: "Repuestos", marca: "OTROS" },
  { grupo: "REPUESTOS - CESTARI", grupoNormalizado: "Repuestos", marca: "OTROS" },
];

const reglaByGrupo = new Map(
  FACTURACION_GRUPO_REGLAS.map((regla) => [normalizarTexto(regla.grupo), regla]),
);

export function normalizarTexto(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function clasificarMarcaFacturacion(grupo: unknown): Marca {
  return reglaByGrupo.get(normalizarTexto(grupo))?.marca ?? "OTROS";
}

export function clasificarGrupoFacturacion(grupo: unknown): GrupoNormalizadoFacturacion {
  return reglaByGrupo.get(normalizarTexto(grupo))?.grupoNormalizado ?? "Otros";
}

export function clasificarTipoTiempoFacturacion(entidad: unknown, observacion: unknown): TipoTiempoFacturacion {
  const entidadNorm = normalizarTexto(entidad);
  if (!entidadNorm.includes("CAMPOS DEL MANANA") && !entidadNorm.includes("CAMPOS DEL MAÑANA")) {
    return "Cliente";
  }

  const obs = normalizarTexto(observacion);
  const tieneNumeroLargo = /\b\d{6,}\b/.test(obs);
  const textoSinProceso = obs.replace(/\bPROCESO\b/g, " ");
  const tieneNombreCliente = /[A-ZÁÉÍÓÚÑ]{3,}[\s-]+[A-ZÁÉÍÓÚÑ]{3,}/.test(textoSinProceso);

  return tieneNumeroLargo && tieneNombreCliente ? "Garantia" : "Interno";
}
