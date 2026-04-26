/**
 * Resampling for telephony (PSTN is band-limited to 300–3400 Hz, so cheap math is fine).
 * If you want musical quality, swap these for libsamplerate / sox.
 */

/** Upsample 8kHz → 16kHz via linear interpolation (1 sample in → 2 samples out). */
export function upsample8to16(pcm8k: Buffer): Buffer {
  const samples = pcm8k.length >> 1;
  if (samples === 0) return Buffer.alloc(0);
  const out = Buffer.alloc(samples * 2 * 2);

  for (let i = 0; i < samples - 1; i += 1) {
    const cur = pcm8k.readInt16LE(i * 2);
    const nxt = pcm8k.readInt16LE((i + 1) * 2);
    out.writeInt16LE(cur, i * 4);
    out.writeInt16LE((cur + nxt) >> 1, i * 4 + 2);
  }
  // Tail: duplicate the last sample (no nxt to interpolate against).
  const last = pcm8k.readInt16LE((samples - 1) * 2);
  out.writeInt16LE(last, (samples - 1) * 4);
  out.writeInt16LE(last, (samples - 1) * 4 + 2);
  return out;
}

/** Downsample 16kHz → 8kHz via 2-sample averaging (cheap anti-alias). */
export function downsample16to8(pcm16k: Buffer): Buffer {
  const samples = pcm16k.length >> 1;
  const outSamples = samples >> 1;
  const out = Buffer.alloc(outSamples * 2);

  for (let i = 0; i < outSamples; i += 1) {
    const a = pcm16k.readInt16LE(i * 4);
    const b = pcm16k.readInt16LE(i * 4 + 2);
    out.writeInt16LE((a + b) >> 1, i * 2);
  }
  return out;
}
