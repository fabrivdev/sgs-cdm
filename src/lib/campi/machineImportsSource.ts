import { supabase } from '@/integrations/supabase/client';
import { machineImportsStory, summarizeMachineImports, type MachineImportUnit } from './machineImports';

const projection = 'id,importacion_linea_id,numero_unidad,chasis,eta,ata,estado_fuente,stock_fisico_confirmado,parque_confirmado,chasis_ambiguo,costo_stock_habilitado,estado_disponibilidad,marca,proveedor';

export async function loadMachineImports(asOf: string) {
  const rows: MachineImportUnit[] = [];
  let expected: number | null = null;
  for (let offset = 0; ; offset += 500) {
    const response = await supabase.from('maquinaria_importacion_unidades_operativas')
      .select(projection, { count: 'exact' }).order('id').range(offset, offset + 499);
    if (response.error) throw response.error;
    if (!Array.isArray(response.data) || !Number.isInteger(response.count) || response.count! < 0)
      throw new Error('No se pudo verificar el universo de importaciones.');
    if (expected === null) expected = response.count;
    if (response.count !== expected) throw new Error('El universo de importaciones cambió durante la lectura.');
    rows.push(...response.data);
    if (rows.length === expected) break;
    if (response.data.length !== 500 || rows.length > expected!) throw new Error('La lectura de importaciones está incompleta.');
  }
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('La lectura de importaciones contiene unidades repetidas.');
  return machineImportsStory(summarizeMachineImports(rows, asOf));
}
