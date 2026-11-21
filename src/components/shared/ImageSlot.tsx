import React, { useRef, useState } from 'react';
import { Coins, Crop, ImagePlus, Shield, Sparkles, Sword, Trash2, User } from 'lucide-react';
import { useImageUrl } from '../../hooks/useImageUrl';
import { deleteImageRecord, saveImageDataUrl } from '../../storage/database';
import { ImageCropModal } from './ImageCropModal';

interface ImageSlotProps {
  imageId?: string;
  fallbackUrl?: string;
  alt: string;
  variant?: 'portrait' | 'item' | 'ability' | 'note' | 'coin';
  shape?: 'square' | 'circle';
  editable?: boolean;
  onImageChange?: (newImageId: string | undefined) => void;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'banner';
}

export const ImageSlot: React.FC<ImageSlotProps> = ({
  imageId,
  fallbackUrl,
  alt,
  variant = 'portrait',
  shape,
  editable = false,
  onImageChange,
  className = '',
  size = 'md',
}) => {
  const resolvedUrl = useImageUrl(imageId, fallbackUrl);
  const [imgError, setImgError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cropSource, setCropSource] = useState<{ src: string; fileName: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const effectiveShape = shape || (variant === 'coin' ? 'circle' : 'square');
  const showImg = Boolean(resolvedUrl) && !imgError;

  const radiusClass =
    effectiveShape === 'circle'
      ? 'rounded-full'
      : size === 'banner' || size === 'xl' || size === 'lg'
        ? 'rounded-2xl'
        : 'rounded-xl';

  const sizeClasses =
    size === 'xs'
      ? `w-9 h-9 ${radiusClass}`
      : size === 'sm'
        ? `w-11 h-11 ${radiusClass}`
        : size === 'banner'
          ? `w-full max-w-[300px] sm:max-w-[340px] lg:max-w-[360px] aspect-square ${radiusClass} shadow-lg`
          : size === 'xl'
            ? `w-32 h-32 sm:w-40 sm:h-40 lg:w-44 lg:h-44 ${radiusClass}`
            : size === 'lg'
              ? `w-24 h-24 sm:w-28 sm:h-28 ${radiusClass}`
              : `w-16 h-16 ${radiusClass}`;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImageChange) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (dataUrl) {
        setCropSource({ src: dataUrl, fileName: file.name || 'imagem.png' });
      }
      if (inputRef.current) inputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmCrop = async (croppedDataUrl: string, fileName: string) => {
    if (!onImageChange) return;
    setBusy(true);
    try {
      const prevId = imageId;
      const saved = await saveImageDataUrl(croppedDataUrl, fileName, 'image/png');
      setImgError(false);
      setCropSource(null);
      onImageChange(saved.id);
      if (prevId) {
        await deleteImageRecord(prevId);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!onImageChange) return;
    if (imageId) {
      await deleteImageRecord(imageId);
    }
    onImageChange(undefined);
  };

  const FallbackIcon =
    variant === 'item'
      ? Sword
      : variant === 'ability'
        ? Sparkles
        : variant === 'note'
          ? Shield
          : variant === 'coin'
            ? Coins
            : User;

  return (
    <div
      className={`relative shrink-0 group ${
        size === 'banner' ? 'w-full flex flex-col items-center' : ''
      } ${className}`}
    >
      <div
        className={`${sizeClasses} overflow-hidden border border-[var(--border-strong)] bg-[var(--bg-elevated)] flex items-center justify-center`}
      >
        {showImg ? (
          <img
            src={resolvedUrl}
            alt={alt}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <FallbackIcon
            className={`${
              size === 'xs'
                ? 'w-4 h-4'
                : size === 'banner'
                  ? 'w-20 h-20'
                  : size === 'xl'
                    ? 'w-12 h-12'
                    : size === 'lg'
                      ? 'w-8 h-8'
                      : 'w-6 h-6'
            } text-[var(--text-muted)]`}
            aria-hidden="true"
          />
        )}
      </div>

      {editable && onImageChange && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={`Selecionar imagem para ${alt}`}
            onChange={handleFileSelect}
          />
          <div
            className={`flex flex-wrap items-center gap-1.5 mt-2 ${
              size === 'banner' ? 'justify-center' : ''
            }`}
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] text-xs font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors whitespace-nowrap"
            >
              <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
              {busy ? 'Salvando...' : showImg ? 'Trocar' : 'Foto'}
            </button>
            {showImg && resolvedUrl && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setCropSource({
                    src: resolvedUrl,
                    fileName: `${alt.toLowerCase().replace(/\s+/g, '_')}_recorte.png`,
                  })
                }
                aria-label={`Ajustar e recortar imagem de ${alt}`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] text-xs font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors whitespace-nowrap"
              >
                <Crop className="w-3.5 h-3.5" aria-hidden="true" />
                Ajustar
              </button>
            )}
            {imageId && (
              <button
                type="button"
                onClick={handleRemove}
                aria-label={`Remover imagem de ${alt}`}
                className="inline-flex items-center justify-center p-1.5 min-h-[36px] min-w-[36px] rounded-lg border border-[var(--border-strong)] text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <ImageCropModal
            open={Boolean(cropSource)}
            imageSrc={cropSource?.src || ''}
            fileName={cropSource?.fileName}
            shape={effectiveShape}
            title={
              variant === 'coin'
                ? `Ajustar Foto da Moeda (${alt})`
                : `Ajustar e Recortar (${alt})`
            }
            onCancel={() => setCropSource(null)}
            onConfirmCrop={handleConfirmCrop}
          />
        </>
      )}
    </div>
  );
};
