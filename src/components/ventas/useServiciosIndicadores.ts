/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { serviceFilteredError as serviceSalesError } from "./serviceSalesFilters";
import { serviceFiltersKey, serviceFilteredRequest, type ServiceSalesFilters } from "./serviceSalesFilters";

export type IndicadoresFiltros = {
  desde: string; hasta: string; sucursal: string; buscar: string;
  tipoTiempo: string; marca?: string; tipoMaquina?: string; filtros?: ServiceSalesFilters;
};

export type IndicadoresTotales = {
  neto: number; mo: number; km: number; repuestos: number; terceros: number;
  ordenes: number; documentos: number; horas: number;
};
export type IndicadorTipo = {
  tipo_tiempo: string; mo: number; km: number; repuestos: number; terceros: number;
  neto: number; ordenes: number; horas: number | null; clientes: number; facturas: number;
  sin_vinculo_historico?: boolean;
};
export type IndicadorMaquina = {
  marca: string; tipo_maquina: string; maquinas: number; ordenes: number; horas: number;
  mo: number; km: number; repuestos: number; terceros: number; neto: number;
};
export type IndicadorMarcaTipo = {
  marca: string; tipo_tiempo: string; horas: number | null; sin_vinculo_historico?: boolean;
  mo: number; km: number; repuestos: number; terceros: number; neto: number;
};
export type IndicadoresResponse = {
  totales: IndicadoresTotales; por_tipo: IndicadorTipo[]; por_maquina: IndicadorMaquina[];
  por_marca_tipo: IndicadorMarcaTipo[];
};

export function useServiciosIndicadores({ desde, hasta, sucursal, buscar, tipoTiempo, marca = "", tipoMaquina = "", filtros }: IndicadoresFiltros) {
  const filterKey = serviceFiltersKey(filtros);
  const [data, setData] = useState<IndicadoresResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!desde || !hasta || desde > hasta) {
      setData(null);
      setError("Seleccioná un rango de fechas válido.");
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    const request = serviceFilteredRequest("ventas_servicios_indicadores_v1", filterKey);
    (supabase as any).rpc(request.name, {
      ...request.params,
      p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo,
      p_marca: marca || null, p_tipo_maquina: tipoMaquina || null, p_buscar: buscar.trim() || null,
    }).then(({ data: response, error: rpcError }: any) => {
      if (!alive) return;
      if (rpcError) { setError(serviceSalesError(rpcError, filterKey)); setData(null); }
      else setData(response as IndicadoresResponse);
      setLoading(false);
    }).catch((failure: { message?: string }) => {
      if (!alive) return;
      setError(serviceSalesError(failure, filterKey)); setData(null); setLoading(false);
    });
    return () => { alive = false; };
  }, [desde, hasta, sucursal, buscar, tipoTiempo, marca, tipoMaquina, filterKey]);

  return { data, loading, error };
}
