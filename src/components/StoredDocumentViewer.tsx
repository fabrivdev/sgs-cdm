import { useEffect, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const DOCUMENT_EVENT = "sig:open-stored-document";
type DocumentBucket = "maquinaria-documentos" | "fleet-invoices";
type StoredDocumentRequest = {
  bucket: DocumentBucket;
  storagePath: string;
  fileName: string;
};
type RenderedDocument = {
  objectUrl: string;
  kind: "IMAGE" | "PDF" | "OTHER";
  pages: string[];
};
export const machineDocumentCache = new Map<string, RenderedDocument>();

export function openStoredDocument(
  bucket: DocumentBucket,
  storagePath: string,
  fileName = "documento",
) {
  window.dispatchEvent(
    new CustomEvent<StoredDocumentRequest>(DOCUMENT_EVENT, {
      detail: { bucket, storagePath, fileName },
    }),
  );
  return Promise.resolve();
}

export function StoredDocumentViewer({ bucket }: { bucket: DocumentBucket }) {
  const [request, setRequest] = useState<StoredDocumentRequest | null>(null);
  const [rendered, setRendered] = useState<RenderedDocument | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const listener = (event: Event) => {
      const next = (event as CustomEvent<StoredDocumentRequest>).detail;
      if (next.bucket !== bucket) return;
      setRendered(null);
      setError("");
      setProgress("");
      setRequest(next);
    };
    window.addEventListener(DOCUMENT_EVENT, listener);
    return () => window.removeEventListener(DOCUMENT_EVENT, listener);
  }, [bucket]);

  useEffect(() => {
    if (!request) return;
    const cacheKey = request.storagePath;
    const cache =
      bucket === "maquinaria-documentos" ? machineDocumentCache : null;
    const cached = cache?.get(cacheKey);
    if (cached) {
      setRendered(cached);
      setProgress("");
      setError("");
      return;
    }
    let cancelled = false;
    let objectUrl: string | undefined;
    setRendered(null);
    setError("");
    setProgress("Descargando documento...");
    void (async () => {
      try {
        const { data, error: downloadError } = await supabase.storage
          .from(bucket)
          .download(request.storagePath);
        if (downloadError || !data)
          throw downloadError ?? new Error("El archivo no está disponible");
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        const normalizedName = request.fileName.toLowerCase();
        const isImage =
          data.type.startsWith("image/") ||
          /\.(png|jpe?g|webp|gif|bmp)$/.test(normalizedName);
        const isPdf =
          data.type === "application/pdf" || normalizedName.endsWith(".pdf");
        if (isImage) {
          const result: RenderedDocument = {
            objectUrl,
            kind: "IMAGE",
            pages: [objectUrl],
          };
          cache?.set(cacheKey, result);
          if (!cancelled) {
            setRendered(result);
            setProgress("");
          }
          return;
        }
        if (!isPdf) {
          const result: RenderedDocument = {
            objectUrl,
            kind: "OTHER",
            pages: [],
          };
          cache?.set(cacheKey, result);
          if (!cancelled) {
            setRendered(result);
            setProgress("");
          }
          return;
        }
        if (!cancelled) setRendered({ objectUrl, kind: "PDF", pages: [] });
        const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
        GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        if (cancelled) return;
        const pdf = await getDocument({
          data: new Uint8Array(await data.arrayBuffer()),
          isImageDecoderSupported: false,
          isOffscreenCanvasSupported: false,
        }).promise;
        const pages: string[] = [];
        const result: RenderedDocument = { objectUrl, kind: "PDF", pages };
        if (!cancelled) setRendered({ ...result, pages: [] });
        const scale = Math.min(1.25, Math.max(1, window.devicePixelRatio || 1));
        try {
          for (
            let pageNumber = 1;
            !cancelled && pageNumber <= pdf.numPages;
            pageNumber += 1
          ) {
            if (!cancelled)
              setProgress(
                `Renderizando página ${pageNumber} de ${pdf.numPages}...`,
              );
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d", { alpha: false });
            if (!context)
              throw new Error("No se pudo preparar la vista del PDF");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({
              canvasContext: context,
              viewport,
              background: "#ffffff",
            }).promise;
            pages.push(canvas.toDataURL("image/jpeg", 0.92));
            canvas.width = 1;
            canvas.height = 1;
            page.cleanup();
            if (!cancelled) setRendered({ ...result, pages: [...pages] });
          }
        } finally {
          await pdf.destroy();
        }
        if (cancelled) return;
        cache?.set(cacheKey, { ...result, pages: [...pages] });
        if (!cancelled) setProgress("");
      } catch (documentError) {
        console.error("No se pudo preparar el documento", documentError);
        if (!cancelled) {
          setProgress("");
          setError(
            "No se pudo generar la vista previa. Podés intentar nuevamente o descargar el archivo.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl && !cache?.has(cacheKey)) URL.revokeObjectURL(objectUrl);
    };
  }, [bucket, request]);

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && setRequest(null)}>
      <DialogContent className="h-[92vh] w-[96vw] max-w-none gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="border-b px-5 py-3 pr-24 text-left">
          <DialogTitle className="truncate text-[14px]">
            {request?.fileName ?? "Documento"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Vista previa del documento seleccionado
          </DialogDescription>
        </DialogHeader>
        {rendered?.objectUrl && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="absolute right-12 top-2.5 h-8"
          >
            <a href={rendered.objectUrl} download={request?.fileName}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Descargar
            </a>
          </Button>
        )}
        <div className="min-h-0 overflow-auto bg-slate-600 p-3">
          {progress && rendered?.pages.length ? (
            <div className="sticky top-0 z-10 mx-auto mb-3 flex w-fit items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1.5 text-[11px] text-white shadow">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              {progress}
            </div>
          ) : null}
          {(!rendered || (progress && !rendered.pages.length)) && !error && (
            <div className="flex h-full min-h-[320px] items-center justify-center gap-2 text-[12px] text-white">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {progress || "Preparando documento..."}
            </div>
          )}
          {error && (
            <div className="flex h-full min-h-[320px] items-center justify-center text-center text-[12px] text-white">
              {error}
            </div>
          )}
          {rendered?.kind === "IMAGE" && (
            <img
              src={rendered.pages[0]}
              alt={request?.fileName}
              className="mx-auto max-h-full max-w-full bg-white object-contain shadow-xl"
            />
          )}
          {rendered?.kind === "PDF" && (
            <div className="space-y-3">
              {rendered.pages.map((page, index) => (
                <img
                  key={index}
                  src={page}
                  alt={`Página ${index + 1} de ${request?.fileName}`}
                  className="mx-auto h-auto max-w-full bg-white shadow-xl"
                />
              ))}
            </div>
          )}
          {rendered?.kind === "OTHER" && (
            <div className="flex h-full min-h-[320px] items-center justify-center text-center text-[12px] text-white">
              Este formato no admite vista previa. Usá Descargar para abrirlo en
              tu equipo.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
