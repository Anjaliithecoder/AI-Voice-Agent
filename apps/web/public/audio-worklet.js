// VoiceForge mic processor: input mono Float32 frames at the AudioContext's
// native sample rate (typically 48 kHz). Outputs Int16 PCM at TARGET_RATE in
// chunks of CHUNK_MS, posted as transferable ArrayBuffers.

const TARGET_RATE = 16000;
const CHUNK_MS = 100;
const TARGET_SAMPLES_PER_CHUNK = (TARGET_RATE * CHUNK_MS) / 1000; // 1600

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._inRate = sampleRate; // global from AudioWorkletGlobalScope
    this._ratio = this._inRate / TARGET_RATE;
    this._outBuf = new Int16Array(TARGET_SAMPLES_PER_CHUNK);
    this._outIdx = 0;
    this._readPos = 0; // fractional read pointer into the next input frame
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch = input[0];
    if (!ch || ch.length === 0) return true;

    // Linear-interpolate resample from this._inRate down to TARGET_RATE.
    // Carry _readPos across frames so we don't get periodic clicks.
    let pos = this._readPos;
    while (pos < ch.length) {
      const i = Math.floor(pos);
      const frac = pos - i;
      const a = ch[i] || 0;
      const b = ch[i + 1] !== undefined ? ch[i + 1] : a;
      const sample = a + (b - a) * frac;

      // Clip and convert to Int16 little-endian.
      const clipped = Math.max(-1, Math.min(1, sample));
      this._outBuf[this._outIdx++] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;

      if (this._outIdx >= TARGET_SAMPLES_PER_CHUNK) {
        const out = new ArrayBuffer(this._outBuf.byteLength);
        new Int16Array(out).set(this._outBuf);
        this.port.postMessage(out, [out]);
        this._outIdx = 0;
      }
      pos += this._ratio;
    }
    this._readPos = pos - ch.length; // negative or small positive carry

    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
