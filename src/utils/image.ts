// ─────────────────────────────────────────────────────────────
// Görsel işleme ve sıkıştırma yardımcıları (Telefon kameraları için)
// 12–48 MP fotoğrafları API'ye göndermeden önce ~100 KB JPEG'e küçültür.
// ─────────────────────────────────────────────────────────────

export interface CompressedImage {
  /** `<img src={dataUrl} />` önizlemesi için tam veri URL'si */
  dataUrl: string;
  /** Gemini inlineData için başlığı kesilmiş saf base64 dizesi */
  base64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.82;

export async function compressImageFile(file: File | Blob): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D bağlamı oluşturulamadı.');

    ctx.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base64 = dataUrl.split(',')[1] ?? '';

    return { dataUrl, base64, mimeType: 'image/jpeg', width, height };
  } finally {
    bitmap.close();
  }
}

export function captureVideoFrame(video: HTMLVideoElement): CompressedImage {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(vw, vh));
  const width = Math.max(1, Math.round(vw * scale));
  const height = Math.max(1, Math.round(vh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Kamera karesi yakalanamadı.');

  ctx.drawImage(video, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const base64 = dataUrl.split(',')[1] ?? '';

  return { dataUrl, base64, mimeType: 'image/jpeg', width, height };
}
