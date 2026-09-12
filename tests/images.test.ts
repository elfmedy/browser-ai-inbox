import { describe, expect, it } from 'vitest';
import { allowPageImage, detectImageType, readBounded } from '../src/assets/inspect';
import { FIXTURE_HASH, FIXTURE_PNG } from './fixtures/image';
import { createHash } from 'node:crypto';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
import { isCitationFavicon } from '../src/assets/content-image';
import { crc32, inflateSync } from 'node:zlib';
import { ownedArrayBuffer } from '../src/assets/binary';

describe('bounded image inspection', () => {
  it('passes only visible image bytes to Vault even for a pooled Buffer', () => {
    const allocation = Buffer.allocUnsafe(8192).fill(0xa5);
    const image = allocation.subarray(117, 117 + FIXTURE_PNG.length);
    image.set(FIXTURE_PNG);
    const buffer = ownedArrayBuffer(image);
    expect(buffer.byteLength).toBe(FIXTURE_PNG.length);
    expect(hash(new Uint8Array(buffer))).toBe(FIXTURE_HASH);
    image.fill(0);
    expect(hash(new Uint8Array(buffer))).toBe(FIXTURE_HASH);
  });
  it('uses a PNG with valid chunk checksums and a decodable pixel', () => {
    let offset = 8;
    const pixels: Buffer[] = [];
    while (offset < FIXTURE_PNG.length) {
      const length = FIXTURE_PNG.readUInt32BE(offset);
      const chunk = FIXTURE_PNG.subarray(offset + 4, offset + 8 + length);
      expect(crc32(chunk)).toBe(FIXTURE_PNG.readUInt32BE(offset + 8 + length));
      if (chunk.subarray(0, 4).toString() === 'IDAT') pixels.push(chunk.subarray(4));
      offset += 12 + length;
    }
    expect(inflateSync(Buffer.concat(pixels))).toEqual(Buffer.from([0, 56, 130, 246, 255]));
  });
  it('excludes the observed citation icon endpoint without excluding content images', () => {
    expect(isCitationFavicon('https://www.google.com/s2/favicons?domain=example.com&sz=128')).toBe(true);
    expect(isCitationFavicon('https://chatgpt.com/backend-api/estuary/content?id=fixture')).toBe(false);
    expect(isCitationFavicon('https://www.google.com/photo.png')).toBe(false);
  });
  it('recognizes fixture PNG and rejects an HTML login response', () => {
    expect(detectImageType(FIXTURE_PNG)).toBe('image/png');
    expect(() => detectImageType(new TextEncoder().encode('<html>please login</html>'))).toThrow();
  });
  it('enforces actual size even if content-length is absent', async () => {
    await expect(readBounded(new Response(new Uint8Array(30)), 10)).rejects.toThrow('Actual image size');
  });
  it('rejects oversized declared responses and failed status', async () => {
    await expect(readBounded(new Response('small', { headers: { 'Content-Length': '100' } }), 10)).rejects.toThrow();
    await expect(readBounded(new Response('forbidden', { status: 403 }))).rejects.toThrow('403');
  });
  it.each(['http://127.0.0.1/a.png', 'https://127.0.0.1/a.png', 'file:///x.png', 'https://evil.test/a.png',
    'https://chatgpt.com@evil.test/x', 'https://a.openai.com:1234/x', 'blob:https://evil.test/id'])('rejects unverified image destination %s', url => {
    expect(allowPageImage(url, 'https://chatgpt.com')).toBe(false);
  });
  it('allows only same-page blobs and known image origins', () => {
    expect(allowPageImage('blob:https://chatgpt.com/id', 'https://chatgpt.com')).toBe(true);
    expect(allowPageImage('https://files.oaiusercontent.com/image', 'https://chatgpt.com')).toBe(true);
  });
});
