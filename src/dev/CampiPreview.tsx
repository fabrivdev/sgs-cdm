// Development-only entry: excluded from the production index.html build.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CampiWelcome } from '../components/campi/CampiWelcome';
import { OPEN_CAMPI_EVENT } from '../components/campi/campiState';
import { Button } from '../components/ui/button';
import '../index.css';
export function Preview() {
  const [dark, setDark] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [modal, setModal] = useState(false);
  return <div className={dark ? 'dark' : ''} style={{ minHeight: '100vh' }}><div className="min-h-screen bg-background p-10 text-foreground">
    <h1 className="text-2xl font-semibold">Campi · prueba de gestos</h1>
    <p className="mt-2 text-sm text-muted-foreground">Vista aislada de revisión. Sin datos de producción.</p>
    <div className="mt-6 flex gap-3"><Button onClick={()=>setDark(!dark)}>Cambiar tema</Button><Button variant="outline" onClick={()=>setClicks(clicks+1)}>Probar clic de la app ({clicks})</Button><Button variant="outline" onClick={()=>setModal(true)}>Abrir modal de prueba</Button><Button aria-label="Abrir menú de cuenta" variant="outline" onClick={()=>window.dispatchEvent(new Event(OPEN_CAMPI_EVENT))}>Conocer a Campi</Button></div>
    {modal && <div role="dialog" aria-modal="true" aria-label="Prueba de prioridad" className="fixed inset-0 z-50 grid place-items-center bg-black/40"><div className="rounded-xl bg-card p-8"><p>Campi debe quedar oculto mientras este modal está abierto.</p><Button onClick={()=>setModal(false)}>Cerrar modal</Button></div></div>}
    <CampiWelcome userId="campi-gesture-preview" />
  </div></div>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
