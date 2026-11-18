import { useEffect, useRef, useState } from 'react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy
} from 'pdfjs-dist';

import { ChevronLeft, ChevronRight, Loader2, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';

GlobalWorkerOptions.workerSrc = '/pdf.worker.training.js';

type Props = {
  materialId: string;
  token: string;
  title: string;
};

export default function TrainingPdfViewer({
  materialId,
  token,
  title
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [containerWidth, setContainerWidth] = useState(720);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => {
      setContainerWidth(Math.max(240, element.clientWidth - 32));
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PDFDocumentProxy | null = null;

    setDocument(null);
    setPageNumber(1);
    setLoading(true);
    setError('');

    const task = getDocument({
      url: `/api/training-v2/materials/${encodeURIComponent(materialId)}/download`,
      httpHeaders: {
        Authorization: `Bearer ${token}`
      },
      withCredentials: false
    });

    task.promise
      .then(pdf => {
        if (cancelled) {
          void pdf.destroy();
          return;
        }

        loadedDocument = pdf;
        setDocument(pdf);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Erro ao abrir PDF:', err);
        setError(
          'Não foi possível visualizar este PDF. ' +
          (err instanceof Error ? err.message : String(err))
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
      void task.destroy();
      if (loadedDocument && loadedDocument !== undefined) {
        // O documento pertence à tarefa de carregamento.
        // task.destroy() libera também os recursos do PDF.
      }
    };
  }, [materialId, token]);

  useEffect(() => {
    if (!document) return;

    let cancelled = false;
    let currentTask: ReturnType<
      Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']
    > | null = null;

    const render = async () => {
      setRendering(true);
      setError('');

      try {
        const page = await document.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = Math.min(containerWidth, 1100);
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas indisponível');

        const ratio = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        currentTask = page.render({
          canvasContext: context,
          viewport,
          transform: ratio === 1
            ? undefined
            : [ratio, 0, 0, ratio, 0, 0]
        });

        await currentTask.promise;

      } catch (err: any) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') {
          console.error('Erro ao renderizar PDF:', err);
          setError('Não foi possível renderizar esta página.');
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    void render();

    return () => {
      cancelled = true;
      currentTask?.cancel();
    };
  }, [document, pageNumber, containerWidth]);

  const totalPages = document?.numPages || 0;

  return (
    <div className="w-full bg-[#F3F5F7] text-[#1F3147]">
      <div
        ref={containerRef}
        className="w-full max-h-[72vh] overflow-auto px-4 py-5"
      >
        {loading ? (
          <div className="min-h-[360px] flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin" />
            <span className="text-sm">Carregando documento...</span>
          </div>
        ) : error && !document ? (
          <div className="min-h-[300px] flex flex-col items-center justify-center gap-3">
            <FileWarning className="h-8 w-8" />
            <span className="text-sm">{error}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="relative max-w-full overflow-hidden bg-white shadow-sm">
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={`${title}, página ${pageNumber}`}
                className="block max-w-full"
              />
              {rendering && (
                <div className="absolute top-3 right-3 rounded-md bg-white/90 p-2 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
        )}
      </div>

      {document && (
        <div className="flex items-center justify-center gap-4 border-t border-[#D5DEE7] bg-white px-3 py-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Página anterior"
            disabled={pageNumber <= 1 || rendering}
            onClick={() => setPageNumber(p => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="min-w-[120px] text-center text-sm font-medium tabular-nums">
            Página {pageNumber} de {totalPages}
          </span>

          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Próxima página"
            disabled={pageNumber >= totalPages || rendering}
            onClick={() => setPageNumber(p => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
