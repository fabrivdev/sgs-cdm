import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export function CancelMachineOrderDialog({open,onOpenChange,operationId,np,onCancelled}:{open:boolean;onOpenChange:(open:boolean)=>void;operationId:string;np:string;onCancelled:()=>void}) {
  const inFlight=useRef(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const cancel=async()=>{
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try {
      const {data,error:failure}=await supabase.rpc('maquinaria_anular_pedido',{p_operacion_id:operationId});
      if(failure)throw failure;
      if(!data || typeof data!=='object' || Array.isArray(data) || data.anulado!==true)throw new Error('No se confirmó la anulación. Revisá el estado antes de reintentar.');
      onCancelled();onOpenChange(false);
    } catch(failure:unknown) {
      const e=failure as {code?:string;message?:string};
      setError(e.code==='PGRST202' ? 'La función de anulación aún no está instalada. El pedido no se modificó.' : e.message || 'No se confirmó la anulación. Revisá el estado antes de reintentar.');
    } finally {inFlight.current=false;setBusy(false);}
  };
  return <AlertDialog open={open} onOpenChange={value=>{if(!busy){setError('');onOpenChange(value);}}}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>¿Anular {np}?</AlertDialogTitle>
        <AlertDialogDescription>El pedido quedará anulado y dejará de contar como pendiente. Se conservarán su ficha, líneas, documentos e historial. Se liberarán únicamente sus reservas de stock o importación, sin cambiar existencias físicas. Si tiene factura, entrega o asignaciones contradictorias, la operación se bloqueará.</AlertDialogDescription>
      </AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Volver</AlertDialogCancel><Button onClick={cancel} disabled={busy}>{busy?'Anulando…':'Anular pedido'}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
