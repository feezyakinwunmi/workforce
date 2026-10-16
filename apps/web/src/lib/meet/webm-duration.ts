/**
 * Browsers' MediaRecorder writes WebM files without a duration, so players can't show the length
 * or let you skip around. This writes the duration into the file's header (the Segment → Info
 * element at the start of the first chunk). Anything unexpected: the chunk is returned unchanged.
 */

const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_DURATION = 0x4489;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_CLUSTER = 0x1f43b675;

type Vint = { value: number; length: number; unknown: boolean };

function readId(b: Uint8Array, at: number): Vint | null {
  const first = b[at];
  if (first === undefined) return null;
  let length = 1;
  while (length <= 4 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 4 || at + length > b.length) return null;
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + b[at + i];
  return { value, length, unknown: false };
}

function readSize(b: Uint8Array, at: number): Vint | null {
  const first = b[at];
  if (first === undefined) return null;
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 8 || at + length > b.length) return null;
  let value = first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    value = value * 256 + b[at + i];
    if (b[at + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: allOnes };
}

/** 8-byte size field (0x01 + 7 bytes): always fits and is easy to write. */
function size8(n: number) {
  const out = new Uint8Array(8);
  out[0] = 0x01;
  for (let i = 7; i >= 1; i--) {
    out[i] = n % 256;
    n = Math.floor(n / 256);
  }
  return out;
}

function readFloat(b: Uint8Array, at: number, len: number) {
  const v = new DataView(b.buffer, b.byteOffset + at, len);
  return len === 4 ? v.getFloat32(0) : len === 8 ? v.getFloat64(0) : 0;
}

function readUint(b: Uint8Array, at: number, len: number) {
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + b[at + i];
  return v;
}

/** New first chunk with the duration written in, or null when it can't be done safely. */
export function withDuration(head: Uint8Array, durationMs: number): Uint8Array | null {
  let at = 0;
  // EBML header
  const ebmlId = readId(head, at);
  if (!ebmlId || ebmlId.value !== 0x1a45dfa3) return null;
  const ebmlSize = readSize(head, at + ebmlId.length);
  if (!ebmlSize || ebmlSize.unknown) return null;
  at += ebmlId.length + ebmlSize.length + ebmlSize.value;
  // Segment
  const segId = readId(head, at);
  if (!segId || segId.value !== ID_SEGMENT) return null;
  const segSize = readSize(head, at + segId.length);
  if (!segSize) return null;
  at += segId.length + segSize.length;
  // Segment children until Info
  while (at < head.length) {
    const id = readId(head, at);
    if (!id) return null;
    const size = readSize(head, at + id.length);
    if (!size || size.unknown) return null;
    const dataAt = at + id.length + size.length;
    if (id.value === ID_CLUSTER) return null;
    if (id.value !== ID_INFO) {
      at = dataAt + size.value;
      continue;
    }
    const end = dataAt + size.value;
    if (end > head.length) return null;
    // Info's children: keep everything except an empty Duration; read the time scale.
    let scale = 1_000_000;
    const kept: Uint8Array[] = [];
    let p = dataAt;
    while (p < end) {
      const cid = readId(head, p);
      if (!cid) return null;
      const csize = readSize(head, p + cid.length);
      if (!csize || csize.unknown) return null;
      const cdata = p + cid.length + csize.length;
      const cend = cdata + csize.value;
      if (cend > end) return null;
      if (cid.value === ID_TIMECODE_SCALE) scale = readUint(head, cdata, csize.value) || scale;
      if (cid.value === ID_DURATION) {
        if (readFloat(head, cdata, csize.value) > 0) return head; // already has one
      } else kept.push(head.subarray(p, cend));
      p = cend;
    }
    const duration = new Uint8Array(11);
    duration[0] = 0x44;
    duration[1] = 0x89;
    duration[2] = 0x88; // size 8
    new DataView(duration.buffer).setFloat64(3, (durationMs * 1_000_000) / scale);
    const body = [...kept, duration];
    const bodyLength = body.reduce((a, x) => a + x.length, 0);
    const info = new Uint8Array(4 + 8 + bodyLength);
    info.set([0x15, 0x49, 0xa9, 0x66], 0);
    info.set(size8(bodyLength), 4);
    let o = 12;
    for (const part of body) {
      info.set(part, o);
      o += part.length;
    }
    const out = new Uint8Array(head.length - (end - at) + info.length);
    out.set(head.subarray(0, at), 0);
    out.set(info, at);
    out.set(head.subarray(end), at + info.length);
    return out;
  }
  return null;
}

/** The whole recording with its duration fixed (WebM only; anything else is returned as is). */
export async function fixWebmDuration(parts: Blob[], durationMs: number, type: string): Promise<Blob> {
  if (!/webm/i.test(type) || !parts.length || durationMs <= 0) return new Blob(parts, { type });
  try {
    const first = new Uint8Array(await parts[0].arrayBuffer());
    const fixed = withDuration(first, durationMs);
    if (!fixed) return new Blob(parts, { type });
    return new Blob([fixed as BlobPart, ...parts.slice(1)], { type });
  } catch {
    return new Blob(parts, { type });
  }
}
