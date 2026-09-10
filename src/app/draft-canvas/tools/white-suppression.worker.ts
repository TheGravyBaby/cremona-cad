import { applyWhiteSuppression } from './white-suppression';

type Request = { id: number; bitmap: ImageBitmap };
type Response = { id: number; blob: Blob } | { id: number; error: string };

function post(message: Response): void {
  (self as any).postMessage(message);
}

self.addEventListener('message', async (e: MessageEvent<Request>) => {
  const { id, bitmap } = e.data;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyWhiteSuppression(imageData);
    ctx.putImageData(imageData, 0, 0);

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    post({ id, blob });
  } catch (err) {
    post({ id, error: String(err) });
  }
});
