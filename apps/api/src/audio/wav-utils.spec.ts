import { describe, it, expect } from 'vitest';
import { pcmRmsEnergy, pcmToWav } from './wav-utils';

describe('pcmRmsEnergy', () => {
  it('returns 0 for an empty buffer', () => {
    const empty = Buffer.alloc(0);
    expect(pcmRmsEnergy(empty)).toBe(0);
  });

  it('returns 0 for a single-byte buffer (less than one sample)', () => {
    const oneByte = Buffer.alloc(1);
    expect(pcmRmsEnergy(oneByte)).toBe(0);
  });

  it('returns 0 for a silent buffer (all zeros)', () => {
    // 100 samples of silence
    const silent = Buffer.alloc(200);
    expect(pcmRmsEnergy(silent)).toBe(0);
  });

  it('computes correct RMS energy for a constant-amplitude signal', () => {
    // 4 samples at Int16 value 16384 (half of 32768)
    const buf = Buffer.alloc(8);
    const amplitude = 16384;
    for (let i = 0; i < 4; i++) {
      buf.writeInt16LE(amplitude, i * 2);
    }
    // RMS of constant signal = amplitude itself
    // Normalised: 16384 / 32768 = 0.5
    const energy = pcmRmsEnergy(buf);
    expect(energy).toBeCloseTo(0.5, 5);
  });

  it('returns 1 for max amplitude (Int16 max = 32767)', () => {
    const buf = Buffer.alloc(4); // 2 samples
    buf.writeInt16LE(32767, 0);
    buf.writeInt16LE(32767, 2);
    const energy = pcmRmsEnergy(buf);
    // 32767 / 32768 ≈ 0.99997
    expect(energy).toBeCloseTo(1.0, 3);
  });

  it('handles negative sample values correctly', () => {
    const buf = Buffer.alloc(4); // 2 samples
    buf.writeInt16LE(-16384, 0);
    buf.writeInt16LE(16384, 2);
    // RMS of [-16384, 16384] = sqrt((16384^2 + 16384^2) / 2) = 16384
    // Normalised: 16384 / 32768 = 0.5
    const energy = pcmRmsEnergy(buf);
    expect(energy).toBeCloseTo(0.5, 5);
  });

  it('returns energy between 0 and 1', () => {
    // Random-ish buffer
    const buf = Buffer.alloc(20);
    for (let i = 0; i < 10; i++) {
      buf.writeInt16LE(Math.floor(Math.random() * 65536) - 32768, i * 2);
    }
    const energy = pcmRmsEnergy(buf);
    expect(energy).toBeGreaterThanOrEqual(0);
    expect(energy).toBeLessThanOrEqual(1);
  });
});

describe('pcmToWav', () => {
  it('produces a buffer that is 44 bytes longer than the input PCM', () => {
    const pcm = Buffer.alloc(100);
    const wav = pcmToWav(pcm, 16000);
    expect(wav.length).toBe(100 + 44);
  });

  it('starts with RIFF header', () => {
    const pcm = Buffer.alloc(32);
    const wav = pcmToWav(pcm, 16000);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
  });

  it('contains WAVE format marker', () => {
    const pcm = Buffer.alloc(32);
    const wav = pcmToWav(pcm, 16000);
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
  });

  it('contains fmt subchunk', () => {
    const pcm = Buffer.alloc(32);
    const wav = pcmToWav(pcm, 16000);
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
  });

  it('contains data subchunk', () => {
    const pcm = Buffer.alloc(32);
    const wav = pcmToWav(pcm, 16000);
    expect(wav.toString('ascii', 36, 40)).toBe('data');
  });

  it('writes correct chunk size (36 + dataSize)', () => {
    const pcm = Buffer.alloc(100);
    const wav = pcmToWav(pcm, 16000);
    const chunkSize = wav.readUInt32LE(4);
    expect(chunkSize).toBe(36 + 100);
  });

  it('writes correct data size', () => {
    const pcm = Buffer.alloc(256);
    const wav = pcmToWav(pcm, 16000);
    const dataSize = wav.readUInt32LE(40);
    expect(dataSize).toBe(256);
  });

  it('writes PCM format (1) at offset 20', () => {
    const pcm = Buffer.alloc(32);
    const wav = pcmToWav(pcm, 16000);
    expect(wav.readUInt16LE(20)).toBe(1);
  });

  it('writes correct number of channels', () => {
    const pcm = Buffer.alloc(32);

    const monoWav = pcmToWav(pcm, 16000, 1);
    expect(monoWav.readUInt16LE(22)).toBe(1);

    const stereoWav = pcmToWav(pcm, 16000, 2);
    expect(stereoWav.readUInt16LE(22)).toBe(2);
  });

  it('writes correct sample rate', () => {
    const pcm = Buffer.alloc(32);
    const wav = pcmToWav(pcm, 44100);
    expect(wav.readUInt32LE(24)).toBe(44100);
  });

  it('writes correct byte rate', () => {
    const pcm = Buffer.alloc(32);
    // byteRate = sampleRate * numChannels * bitsPerSample / 8
    // 16000 * 1 * 16 / 8 = 32000
    const wav = pcmToWav(pcm, 16000, 1, 16);
    expect(wav.readUInt32LE(28)).toBe(32000);
  });

  it('writes correct block align', () => {
    const pcm = Buffer.alloc(32);
    // blockAlign = numChannels * bitsPerSample / 8 = 1 * 16 / 8 = 2
    const wav = pcmToWav(pcm, 16000, 1, 16);
    expect(wav.readUInt16LE(32)).toBe(2);
  });

  it('writes correct bits per sample', () => {
    const pcm = Buffer.alloc(32);
    const wav = pcmToWav(pcm, 16000, 1, 16);
    expect(wav.readUInt16LE(34)).toBe(16);
  });

  it('appends the original PCM data after the header', () => {
    const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const wav = pcmToWav(pcm, 16000);
    const dataPortion = wav.subarray(44);
    expect(Buffer.compare(dataPortion, pcm)).toBe(0);
  });

  it('uses default values for numChannels and bitsPerSample', () => {
    const pcm = Buffer.alloc(32);
    const wav = pcmToWav(pcm, 16000);
    expect(wav.readUInt16LE(22)).toBe(1);  // numChannels default = 1
    expect(wav.readUInt16LE(34)).toBe(16); // bitsPerSample default = 16
  });
});
