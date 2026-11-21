import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Crop, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { computeCroppedSourceRect } from '../../engine/imageCropEngine';

interface ImageCropModalProps {
  open: boolean;
  imageSrc: string;
  fileName?: string;
  shape?: 'square' | 'circle';
  title?: string;
  onCancel: () => void;
  onConfirmCrop: (croppedDataUrl: string, fileName: string) => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  open,
  imageSrc,
  fileName = 'imagem_recortada.png',
  shape = 'square',
  title = 'Ajustar e Recortar Foto',
  onCancel,
  onConfirmCrop,
}) => {
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    startOffX: number;
    startOffY: number;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    startOffX: 0,
    startOffY: 0,
  });

  const resetAdjustments = useCallback(() => {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }, []);

  useEffect(() => {
    if (!open || !imageSrc) return;
    resetAdjustments();
    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!active) return;
      loadedImageRef.current = img;
      setNaturalSize({
        w: img.naturalWidth || img.width || 512,
        h: img.naturalHeight || img.height || 512,
      });
    };
    img.src = imageSrc;
    return () => {
      active = false;
    };
  }, [open, imageSrc, resetAdjustments]);

  useEffect(() => {
    if (!open || !loadedImageRef.current || !previewCanvasRef.current || naturalSize.w <= 0) {
      return;
    }
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 280;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);

    const rect = computeCroppedSourceRect({
      naturalWidth: naturalSize.w,
      naturalHeight: naturalSize.h,
      zoom,
      offsetX,
      offsetY,
      aspectRatio: 1,
    });

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      loadedImageRef.current,
      rect.sx,
      rect.sy,
      rect.sw,
      rect.sh,
      0,
      0,
      size,
      size
    );
  }, [open, naturalSize, zoom, offsetX, offsetY]);

  if (!open) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startOffX: offsetX,
      startOffY: offsetY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current.dragging) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    // Scale sensitivity gently with current zoom
    const sensitivity = 1 / 120;
    setOffsetX(Math.min(1, Math.max(-1, dragStateRef.current.startOffX + dx * sensitivity)));
    setOffsetY(Math.min(1, Math.max(-1, dragStateRef.current.startOffY + dy * sensitivity)));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragStateRef.current.dragging) {
      dragStateRef.current.dragging = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore if already released
      }
    }
  };

  const handleApplyCrop = () => {
    const img = loadedImageRef.current;
    if (!img || naturalSize.w <= 0) return;
    setBusy(true);
    try {
      const outputSize = 512;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = outputSize;
      outCanvas.height = outputSize;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return;

      const rect = computeCroppedSourceRect({
        naturalWidth: naturalSize.w,
        naturalHeight: naturalSize.h,
        zoom,
        offsetX,
        offsetY,
        aspectRatio: 1,
      });

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        img,
        rect.sx,
        rect.sy,
        rect.sw,
        rect.sh,
        0,
        0,
        outputSize,
        outputSize
      );

      const dataUrl = outCanvas.toDataURL('image/png');
      onConfirmCrop(dataUrl, fileName);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crop-modal-title"
    >
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Crop className="w-4 h-4 text-[var(--accent-strong)]" aria-hidden="true" />
            <h3
              id="crop-modal-title"
              className="font-display text-base font-semibold text-[var(--text-primary)]"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fechar ajuste de foto"
            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          Arraste a imagem para reposicionar e use o zoom para enquadrar perfeitamente.
        </p>

        {/* Interactive Crop Stage */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-[280px] h-[280px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-track)] overflow-hidden flex items-center justify-center select-none">
            <canvas
              ref={previewCanvasRef}
              width={280}
              height={280}
              data-testid="crop-preview-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`w-[280px] h-[280px] touch-none cursor-grab active:cursor-grabbing ${
                shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
              }`}
            />
            {/* Frame Guide Overlay */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 border-2 border-[var(--accent-color)]/80 ${
                shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
              }`}
            />
          </div>
        </div>

        {/* Zoom & Fine Pan Controls */}
        <div className="space-y-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
            <label htmlFor="crop-zoom-range" className="sr-only">
              Zoom da foto
            </label>
            <input
              id="crop-zoom-range"
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-[var(--accent-color)]"
            />
            <ZoomIn className="w-4 h-4 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
            <span className="font-mono-num text-xs font-semibold text-[var(--text-primary)] w-11 text-right">
              {zoom.toFixed(1)}x
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label
                htmlFor="crop-pan-x"
                className="block text-[11px] text-[var(--text-muted)] mb-1"
              >
                Posição Horizontal
              </label>
              <input
                id="crop-pan-x"
                type="range"
                min={-1}
                max={1}
                step={0.02}
                value={offsetX}
                onChange={(e) => setOffsetX(Number(e.target.value))}
                className="w-full accent-[var(--accent-color)]"
              />
            </div>
            <div>
              <label
                htmlFor="crop-pan-y"
                className="block text-[11px] text-[var(--text-muted)] mb-1"
              >
                Posição Vertical
              </label>
              <input
                id="crop-pan-y"
                type="range"
                min={-1}
                max={1}
                step={0.02}
                value={offsetY}
                onChange={(e) => setOffsetY(Number(e.target.value))}
                className="w-full accent-[var(--accent-color)]"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={resetAdjustments}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Centralizar
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || naturalSize.w <= 0}
            onClick={handleApplyCrop}
            data-testid="confirm-crop-button"
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent-color)' }}
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            {busy ? 'Salvando...' : 'Aplicar Recorte'}
          </button>
        </div>
      </div>
    </div>
  );
};
