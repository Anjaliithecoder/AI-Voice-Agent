import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CallState,
  EVENTS,
  type AgentAudioEndPayload,
  type AgentSpeakingPayload,
  type AgentStoppedPayload,
  type CallStartedPayload,
  type ErrorPayload,
  type MetricsTurnPayload,
  type ToolInvokedPayload,
  type TranscriptAgentPayload,
  type TranscriptUserPayload,
} from '@voiceforge/shared';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { useCallStore } from '@/store/callStore';
import { useAudioCapture } from './useAudioCapture';
import { useAudioPlayer } from './useAudioPlayer';

export function useVoiceCall(): {
  startCall: () => Promise<void>;
  endCall: () => void;
  micLevel: number;
  reconnecting: boolean;
} {
  const [reconnecting, setReconnecting] = useState(false);
  const player = useAudioPlayer();
  const playerRef = useRef(player);
  playerRef.current = player;

  const setCallState = useCallStore((s) => s.setCallState);
  const setCallId = useCallStore((s) => s.setCallId);
  const setError = useCallStore((s) => s.setError);
  const setTtsActive = useCallStore((s) => s.setTtsActive);
  const beginUserTurn = useCallStore((s) => s.beginUserTurn);
  const appendAgentDelta = useCallStore((s) => s.appendAgentDelta);
  const finalizeAgentText = useCallStore((s) => s.finalizeAgentText);
  const setTurnMetrics = useCallStore((s) => s.setTurnMetrics);
  const recordTool = useCallStore((s) => s.recordTool);
  const reset = useCallStore((s) => s.reset);

  const capture = useAudioCapture({
    onChunk: (pcm) => {
      const sock = getSocket();
      if (sock.connected) {
        sock.emit(EVENTS.AUDIO_CHUNK, pcm);
      }
    },
    onSpeechStart: () => {
      // Barge-in: if agent is currently playing, cut audio + tell server.
      if (playerRef.current.isPlaying) {
        playerRef.current.stop();
        const sock = getSocket();
        sock.emit(EVENTS.USER_BARGE_IN, { at: Date.now() });
      }
    },
  });

  const startCall = useCallback(async () => {
    setError(null);
    reset();
    setCallState(CallState.Connecting);

    const sock = getSocket();

    // Wire all server events once per socket lifecycle.
    sock.removeAllListeners();
    sock.on('connect', () => {
      sock.emit(EVENTS.CALL_START, { agentId: 'arya' });
    });
    sock.on('connect_error', (err) => {
      setError(`Connection error: ${err.message}`);
      setCallState(CallState.Idle);
    });
    sock.on('disconnect', () => {
      setCallState(CallState.Ended);
    });

    sock.io.on('reconnect_attempt', () => {
      setReconnecting(true);
    });

    sock.io.on('reconnect', () => {
      setReconnecting(false);
      // Re-establish the call if one was active before disconnect.
      const currentCallId = useCallStore.getState().callId;
      if (currentCallId) {
        sock.emit(EVENTS.CALL_START, { agentId: 'arya' });
      }
    });

    sock.io.on('reconnect_failed', () => {
      setReconnecting(false);
      setError('Connection lost. Please try again.');
      setCallState(CallState.Ended);
    });

    sock.on(EVENTS.CALL_STARTED, (p: CallStartedPayload) => {
      setCallId(p.callId);
      setCallState(CallState.Speaking); // greeting comes immediately
    });

    sock.on(EVENTS.TRANSCRIPT_USER, (p: TranscriptUserPayload) => {
      beginUserTurn(p.turnId, p.text);
    });

    sock.on(EVENTS.TRANSCRIPT_AGENT, (p: TranscriptAgentPayload) => {
      if (p.delta) {
        appendAgentDelta(p.turnId, p.delta);
      } else if (p.final) {
        finalizeAgentText(p.turnId, p.text);
      }
    });

    sock.on(EVENTS.AGENT_AUDIO_CHUNK, (chunk: ArrayBuffer) => {
      playerRef.current.appendChunk(chunk);
    });

    sock.on(EVENTS.AGENT_SPEAKING, (_p: AgentSpeakingPayload) => {
      void _p;
      setCallState(CallState.Speaking);
      setTtsActive(true);
    });

    sock.on(EVENTS.AGENT_AUDIO_END, (_p: AgentAudioEndPayload) => {
      void _p;
      // The server has finished pushing audio for this turn.
      playerRef.current.flushSentence();
    });

    sock.on(EVENTS.AGENT_STOPPED, (_p: AgentStoppedPayload) => {
      void _p;
      setTtsActive(false);
      setCallState(CallState.Listening);
    });

    sock.on(EVENTS.METRICS_TURN, (m: MetricsTurnPayload) => {
      setTurnMetrics(m);
    });

    sock.on(EVENTS.TOOL_INVOKED, (t: ToolInvokedPayload) => {
      recordTool(t);
    });

    sock.on(EVENTS.ERROR, (e: ErrorPayload) => {
      setError(`${e.code}: ${e.message}`);
      if (!e.recoverable) setCallState(CallState.Ended);
    });

    sock.connect();

    // The server emits sentence-by-sentence audio; we need to flush whenever a
    // new agent_speaking arrives mid-stream too. Simplest: also flush on every
    // chunk batch boundary by using a small debounce.
    // For MVP, audio_end fires per *turn*, not per sentence, so we additionally
    // flush periodically while chunks are arriving.
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    const startFlushTimer = () => {
      if (flushTimer) return;
      flushTimer = setInterval(() => {
        playerRef.current.flushSentence();
      }, 250);
    };
    sock.on(EVENTS.AGENT_SPEAKING, startFlushTimer);
    sock.on(EVENTS.AGENT_STOPPED, () => {
      if (flushTimer) clearInterval(flushTimer);
      flushTimer = null;
      playerRef.current.flushSentence();
    });

    try {
      await capture.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Mic failed';
      setError(msg);
      setCallState(CallState.Idle);
      sock.disconnect();
    }
  }, [
    capture,
    appendAgentDelta,
    beginUserTurn,
    finalizeAgentText,
    recordTool,
    reset,
    setCallId,
    setCallState,
    setError,
    setTtsActive,
    setTurnMetrics,
  ]);

  const endCall = useCallback(() => {
    const sock = getSocket();
    if (sock.connected) sock.emit(EVENTS.CALL_END, {});
    capture.stop();
    playerRef.current.stop();
    disconnectSocket();
    setCallState(CallState.Ended);
  }, [capture, setCallState]);

  useEffect(() => {
    return () => {
      capture.stop();
      disconnectSocket();
    };
    // eslint-disable-next-line
  }, []);

  return { startCall, endCall, micLevel: capture.level, reconnecting };
}
