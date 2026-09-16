import { ProbeError } from '../shared/errors';
import { detectImageType, readBounded } from './inspect';
export async function downloadDomImage(reference: string, pageOrigin: string) {
  const url = new URL(reference);
  const localBlob = url.protocol === 'blob:' && url.origin === pageOrigin;
  const inline = /^data:image\/(?:png|jpeg|webp|gif|avif);base64,/i.test(reference);
  const remote = url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    (url.origin === pageOrigin || url.hostname.endsWith('.googleusercontent.com') || url.hostname.endsWith('.claude.ai'));
  if (!localBlob && !inline && !remote) throw new ProbeError('IMAGE_REFERENCE_UNSUPPORTED', 'Image host is unsupported');
  if (reference.length > 35 * 1024 * 1024) throw new ProbeError('LIMIT_EXCEEDED', 'Inline image too large');
  let response: Response;
  try { response = await fetch(reference, { credentials: url.origin === pageOrigin ? 'same-origin' : 'omit', redirect: 'error', signal: AbortSignal.timeout(30000) }); }
  catch { throw new ProbeError('ASSET_FETCH_FAILED', 'Image could not be downloaded'); }
  const bytes = await readBounded(response); const mime = detectImageType(bytes);
  const advertised = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (advertised && advertised !== mime && advertised !== 'application/octet-stream') throw new ProbeError('IMAGE_MIME_MISMATCH', 'Image type differs');
  return { bytes, mime };
}
