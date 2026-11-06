"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

/** Controlled PDF.js reader: the teacher's page state renders the same page for every participant. */
export default function PdfReader({ src, page, title, onPageCount }: { src: string; page: number; title: string; onPageCount?: (count: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<{ src: string; pdf: PDFDocumentProxy } | null>(null);
  const [width, setWidth] = useState(700);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const countCallback = useRef(onPageCount);
  countCallback.current = onPageCount;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const next = Math.max(240, Math.floor(entries[0].contentRect.width));
      setWidth(current => current === next ? current : next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let task: import("pdfjs-dist").PDFDocumentLoadingTask | null = null;
    setLoading(true); setError(""); setDocument(null);
    void import("pdfjs-dist").then(pdfjs => {
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      task = pdfjs.getDocument({ url: src, withCredentials: true, cMapUrl: "/pdf-assets/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdf-assets/standard_fonts/" });
      return task.promise.then(pdf => {
        if (cancelled) return;
        setDocument({ src, pdf });
        countCallback.current?.(pdf.numPages);
      });
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "The PDF could not be loaded.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; void task?.destroy().catch(() => {}); };
  }, [src, retry]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !document || document.src !== src) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    setLoading(true); setError("");
    void document.pdf.getPage(Math.max(1, Math.min(page, document.pdf.numPages))).then(pdfPage => {
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = pdfPage.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser could not create the PDF canvas.");
      renderTask = pdfPage.render({ canvas, canvasContext: context, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      return renderTask.promise;
    }).then(() => { if (!cancelled) setLoading(false); }).catch((cause: unknown) => {
      if (cancelled || (cause instanceof Error && cause.name === "RenderingCancelledException")) return;
      setLoading(false); setError(cause instanceof Error ? cause.message : "The PDF page could not be rendered.");
    });
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [document, src, page, width]);

  return <div ref={containerRef} className="relative min-h-64 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" aria-busy={loading}>
    <canvas ref={canvasRef} role="img" aria-label={`${title}, page ${page}`} className="block max-w-full bg-white"/>
    {loading && !error && <div className="absolute inset-0 grid min-h-64 place-items-center bg-slate-50/90 text-sm font-semibold text-slate-500">Loading PDF page {page}…</div>}
    {error && <div role="alert" className="absolute inset-0 grid min-h-64 place-items-center bg-white p-6 text-center"><div><p className="text-sm font-bold text-red-700">PDF could not be displayed</p><p className="mt-2 max-w-md break-words text-xs leading-5 text-slate-500">{error}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => setRetry(value => value + 1)} className="rounded-lg bg-teal-800 px-4 py-2 text-xs font-bold text-white">Retry</button><a href={src} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-teal-800">Open original PDF ↗</a></div></div></div>}
  </div>;
}
