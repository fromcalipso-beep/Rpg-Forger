export interface CropViewportInput {
  naturalWidth: number;
  naturalHeight: number;
  zoom: number;
  offsetX: number; // Normalized pan offset [-1, 1] relative to available pan travel
  offsetY: number; // Normalized pan offset [-1, 1] relative to available pan travel
  aspectRatio?: number; // targetWidth / targetHeight (default 1 = square)
}

export interface CropSourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Computes clamped source crop rectangle on an image of naturalWidth x naturalHeight
 * given a zoom factor (>= 1), normalized pan offsets [-1..1], and target aspect ratio.
 */
export function computeCroppedSourceRect(input: CropViewportInput): CropSourceRect {
  const natW = Math.max(1, Math.round(input.naturalWidth));
  const natH = Math.max(1, Math.round(input.naturalHeight));
  const aspect = Math.max(0.1, input.aspectRatio || 1);
  const zoom = Math.min(6, Math.max(1, Number.isFinite(input.zoom) ? input.zoom : 1));

  // Base cover crop size (maximum rectangle of target aspect fitting inside natural bounds)
  let baseCropW: number;
  let baseCropH: number;
  if (natW / natH > aspect) {
    baseCropH = natH;
    baseCropW = natH * aspect;
  } else {
    baseCropW = natW;
    baseCropH = natW / aspect;
  }

  const sw = Math.max(1, Math.min(natW, baseCropW / zoom));
  const sh = Math.max(1, Math.min(natH, baseCropH / zoom));

  const maxPanX = Math.max(0, natW - sw);
  const maxPanY = Math.max(0, natH - sh);

  const normX = Math.min(1, Math.max(-1, Number.isFinite(input.offsetX) ? input.offsetX : 0));
  const normY = Math.min(1, Math.max(-1, Number.isFinite(input.offsetY) ? input.offsetY : 0));

  // offset = 0 centers the crop; -1 aligns left/top, +1 aligns right/bottom
  const sx = Math.max(0, Math.min(maxPanX, (maxPanX / 2) * (1 - normX)));
  const sy = Math.max(0, Math.min(maxPanY, (maxPanY / 2) * (1 - normY)));

  return {
    sx: Math.round(sx),
    sy: Math.round(sy),
    sw: Math.max(1, Math.round(sw)),
    sh: Math.max(1, Math.round(sh)),
  };
}
