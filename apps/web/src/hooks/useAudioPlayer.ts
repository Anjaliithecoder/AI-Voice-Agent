import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Per-sentence MP3 playback.
 *
 * The server emits one or more `agent:audio_chunk` binary frames per sentence,
 * then an `agent:audio_end` event. We accumulate chunks and play each sentence
 * as a Blob via an HTMLAudioElement queue.
 *
 * For barge-in: stop() empties the queue and tears down the current element
 * within ~one event-loop tick (<50 ms typical).
 */
export interface AudioPlayerControls {
  appendChunk: (chunk: ArrayBuffer) => void;
  flushSentence: () => void;
  stop: () => void;
  isPlaying: boolean;
}

export function useAudioPlayer(): AudioPlayerControls {
  const [isPlaying, setIsPlaying] = useState(false);

  const pendingChunks = useRef<Uint8Array[]>([]);
  const queue = useRef<Blob[]>([]);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const currentUrl = useRef<string | null>(null);
  const playingRef = useRef(false);

  const playNext = useCallback(() => {
    if (playingRef.current) return;
    const blob = queue.current.shift();
    if (!blob) {
      playingRef.current = false;
      setIsPlaying(false);
      return;
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio.current = audio;
    currentUrl.current = url;
    playingRef.current = true;
    setIsPlaying(true);

    const cleanup = () => {
      URL.revokeObjectURL(url);
      currentAudio.current = null;
      currentUrl.current = null;
      playingRef.current = false;
      // chain to next
      playNext();
    };
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
    void audio.play().catch((err) => {
      console.warn('audio.play() failed:', err);
      cleanup();
    });
  }, []);

  const appendChunk = useCallback((chunk: ArrayBuffer) => {
    pendingChunks.current.push(new Uint8Array(chunk));
  }, []);

  const flushSentence = useCallback(() => {
    if (pendingChunks.current.length === 0) return;
    const parts = pendingChunks.current;
    pendingChunks.current = [];
    const ab = parts as unknown as BlobPart[];
    const blob = new Blob(ab, { type: 'audio/mpeg' });
    queue.current.push(blob);
    playNext();
  }, [playNext]);

  const stop = useCallback(() => {
    queue.current = [];
    pendingChunks.current = [];
    if (currentAudio.current) {
      try {
        currentAudio.current.pause();
        currentAudio.current.currentTime = 0;
      } catch {
        // ignore
      }
    }
    if (currentUrl.current) {
      URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = null;
    }
    currentAudio.current = null;
    playingRef.current = false;
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { appendChunk, flushSentence, stop, isPlaying };
}
