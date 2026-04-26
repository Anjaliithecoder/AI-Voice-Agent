/**
 * Wrap raw 16-bit PCM with a 44-byte WAV header so Groq's Whisper accepts it.
 * Reference: http://soundfile.sapp.org/doc/WaveFormat/
 */
export function pcmToWav(
  pcm: Buffer,
  sampleRate: number,
  numChannels = 1,
  bitsPerSample = 16,
): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const chunkSize = 36 + dataSize;

  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(chunkSize, 4);
  header.write('WAVE', 8);

  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM subchunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

/**
 * RMS energy of an Int16 PCM buffer, normalised to 0..1.
 * Used by the energy-based VAD to detect speech vs silence.
 */
export function pcmRmsEnergy(pcm: Buffer): number {
  if (pcm.length < 2) return 0;
  const samples = pcm.length / 2;
  let sumSq = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const s = pcm.readInt16LE(i);
    sumSq += s * s;
  }
  const rms = Math.sqrt(sumSq / samples);
  return rms / 32768; // Int16 max
}
