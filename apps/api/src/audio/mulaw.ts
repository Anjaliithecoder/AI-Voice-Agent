/**
 * G.711 μ-law codec (ITU-T G.711) used by Twilio Media Streams (`audio/x-mulaw;rate=8000`).
 *
 * Each sample = 1 byte μ-law ↔ 1 int16 PCM sample. 8 kHz mono.
 */

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

/** Decode one μ-law byte → int16 PCM sample. */
export function mulawDecodeSample(uVal: number): number {
  uVal = ~uVal & 0xff;
  const sign = uVal & 0x80;
  const exponent = (uVal >> 4) & 0x07;
  const mantissa = uVal & 0x0f;
  let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
  sample -= MULAW_BIAS;
  return sign ? -sample : sample;
}

/** Encode one int16 PCM sample → μ-law byte. */
export function mulawEncodeSample(pcm: number): number {
  let sign = 0;
  let value = pcm | 0;
  if (value < 0) {
    value = -value;
    sign = 0x80;
  }
  if (value > MULAW_CLIP) value = MULAW_CLIP;
  value += MULAW_BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (value & mask) === 0 && exponent > 0; mask >>= 1) {
    exponent -= 1;
  }
  const mantissa = (value >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** Decode μ-law buffer → int16 LE PCM buffer (2× the size). */
export function mulawDecodeBuffer(mulaw: Buffer): Buffer {
  const out = Buffer.alloc(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i += 1) {
    out.writeInt16LE(mulawDecodeSample(mulaw[i]), i * 2);
  }
  return out;
}

/** Encode int16 LE PCM buffer → μ-law buffer (½ the size). */
export function mulawEncodeBuffer(pcm: Buffer): Buffer {
  const samples = pcm.length >> 1;
  const out = Buffer.alloc(samples);
  for (let i = 0; i < samples; i += 1) {
    out[i] = mulawEncodeSample(pcm.readInt16LE(i * 2));
  }
  return out;
}
