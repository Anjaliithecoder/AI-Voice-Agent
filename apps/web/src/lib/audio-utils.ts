/**
 * Energy-based VAD on a mono Float32 frame.
 * Returns RMS in 0..1, used by the client to detect speech for barge-in.
 */
export function rmsEnergyFloat32(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < frame.length; i += 1) {
    const s = frame[i];
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / frame.length);
}
