import { useEffect, useState } from 'react';
import { getImageRecord } from '../storage/database';

const memoryCache = new Map<string, string>();

export function invalidateImageCache(imageId: string) {
  memoryCache.delete(imageId);
}

export function useImageUrl(imageId?: string, fallbackUrl?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (imageId && memoryCache.has(imageId)) return memoryCache.get(imageId);
    return fallbackUrl;
  });

  useEffect(() => {
    let active = true;
    if (!imageId) {
      setUrl(fallbackUrl);
      return;
    }

    if (memoryCache.has(imageId)) {
      setUrl(memoryCache.get(imageId));
      return;
    }

    getImageRecord(imageId).then((rec) => {
      if (!active) return;
      if (rec?.dataUrl) {
        memoryCache.set(imageId, rec.dataUrl);
        setUrl(rec.dataUrl);
      } else {
        setUrl(fallbackUrl);
      }
    });

    return () => {
      active = false;
    };
  }, [imageId, fallbackUrl]);

  return url;
}
