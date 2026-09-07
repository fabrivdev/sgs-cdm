import { Button } from "@/components/ui/button";
import { catalogLineKey, reviewCatalogLine, type CatalogLine, type MachineCatalog } from "@/lib/machineOrderValidation";

export function MachineCatalogLineReview({ line, catalog, confirmed, preserved, onConfirm, onSelect }: {
  line: CatalogLine; catalog: MachineCatalog; confirmed?: string; preserved?: boolean;
  onConfirm: (key: string) => void; onSelect: (line: CatalogLine) => void;
}) {
  if (!line.marca.trim() || !line.modelo.trim()) return null;
  const review = reviewCatalogLine(line, catalog);
  if (preserved && review.archived) return <p className="mt-2 text-[11px] text-muted-foreground">Dato histórico conservado; ya no se ofrece para nuevas cargas.</p>;
  if (review.archived) return <p className="mt-2 text-xs text-destructive">La marca o el modelo está eliminado del listado. Elegí otro o restauralo desde Gestionar.</p>;
  if (!review.needsConfirmation && review.match?.subgrupo === line.subgrupo) return <p className="mt-2 text-[11px] text-emerald-700">Marca, tipo y modelo coinciden con el catálogo.</p>;
  return <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
    <p>{review.match ? `Este modelo figura en ${review.match.subgrupo}. Seleccioná la coincidencia para corregir el tipo.` : "La lectura no coincide exactamente con el catálogo. Revisá las opciones antes de crear un modelo nuevo."}</p>
    <div className="flex flex-wrap gap-1">{(review.match ? [review.match] : review.suggestions).map(model => <Button type="button" key={model.id} size="sm" variant="outline" className="h-auto whitespace-normal text-left text-xs" onClick={() => onSelect({ marca: model.marca_nombre, modelo: model.nombre, subgrupo: model.subgrupo })}>{model.nombre} · {model.subgrupo}</Button>)}</div>
    {(!review.match || review.unknownBrand) && <label className="flex items-start gap-2"><input className="mt-0.5" type="checkbox" checked={confirmed === catalogLineKey(line)} onChange={e => onConfirm(e.target.checked ? catalogLineKey(line) : "")} /><span>Revisé la NP y confirmo {review.unknownBrand ? "esta marca y modelo nuevos" : "este modelo nuevo"}: {line.marca} · {line.modelo}.</span></label>}
  </div>;
}
