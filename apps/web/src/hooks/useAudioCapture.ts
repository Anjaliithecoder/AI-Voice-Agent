import { useCallback, useEffect, useRef, useState } from 'react';
import { rmsEnergyFloat32 } from '@/lib/audio-utils';

export interface AudioCaptureCallbacks {
  /** Fires every ~100ms with a 16-bit PCM @ 16 kHz ArrayBuffer (1600 samples). */
  onChunk: (pcm: ArrayBuffer) => void;
  /** Fires when client-side VAD detects speech onset. Used for barge-in. */
  onSpeechStart?: () => void;
  /** Fires when client-side VAD detects sustained silence. */
  onSpeechEnd?: () => void;
}

export interface AudioCaptureControls {
  start: () => Promise<void>;
  stop: () => void;
  isCapturing: boolean;
  level: number;
  error: string | null;
}

const SPEECH_ENERGY_THRESHOLD = 0.025;
const SPEECH_END_SILENCE_MS = 700;
const SPEECH_START_MIN_MS = 80;

export function useAudioCapture(
  callbacks: AudioCaptureCallbacks,
): AudioCaptureControls {
  const [isCapturing, setIsCapturing] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const cbRef = useRef(callbacks);
  const rafRef = useRef<number | null>(null);

  // VAD bookkeeping
  const speechActiveRef = useRef(false);
  const speechStartedAtRef = useRef<number>(0);
  const lastSpeechAtRef = useRef<number>(0);

  cbRef.current = callbacks;

  const start = useCallback(async () => {
    if (isCapturing) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000, // hint; browser may ignore
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      await ctx.audioWorklet.addModule('/audio-worklet.js');

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const worklet = new AudioWorkletNode(ctx, 'mic-processor');
      workletRef.current = worklet;
      worklet.port.onmessage = (event) => {
        cbRef.current.onChunk(event.data as ArrayBuffer);
      };

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      analyserRef.current = analyser;

      source.connect(worklet);
      source.connect(analyser);

      // VAD + level loop
      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buf);
        const energy = rmsEnergyFloat32(buf);
        setLevel(energy);

        const now = performance.now();
        if (energy >= SPEECH_ENERGY_THRESHOLD) {
          if (!speechActiveRef.current) {
            speechStartedAtRef.current = now;
          }
          if (
            !speechActiveRef.current &&
            now - speechStartedAtRef.current >= SPEECH_START_MIN_MS
          ) {
            speechActiveRef.current = true;
            cbRef.current.onSpeechStart?.();
          }
          lastSpeechAtRef.current = now;
        } else if (
          speechActiveRef.current &&
          now - lastSpeechAtRef.current >= SPEECH_END_SILENCE_MS
        ) {
          speechActiveRef.current = false;
          cbRef.current.onSpeechEnd?.();
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      setIsCapturing(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Mic access failed';
      setError(msg);
      throw err;
    }
  }, [isCapturing]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    workletRef.current?.disconnect();
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    workletRef.current = null;
    sourceRef.current = null;
    analyserRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    void ctxRef.current?.close();
    ctxRef.current = null;

    speechActiveRef.current = false;
    setIsCapturing(false);
    setLevel(0);
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { start, stop, isCapturing, level, error };
}
