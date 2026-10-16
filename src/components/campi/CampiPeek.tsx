/** The approved edge pose uses only the existing head and one raised hand. */
export function CampiPeek() {
  return <span className="campi-peek" aria-hidden="true">
    <img className="campi-peek-head" src="/campi/campi-curious.webp" alt="" draggable={false} />
    <img className="campi-peek-hand" src="/campi/campi-run.webp" alt="" draggable={false} />
  </span>;
}
