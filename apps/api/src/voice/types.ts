export interface TurnContext {
  id: string;
  startedAt: number;
  sttMs: number;
  llmMs: number;
  ttsMs: number;
  ttsStartedAt?: number;
  /** Aborts the current LLM/TTS stream when set on barge-in or call end. */
  abort: AbortController;
}

export interface SessionConfig {
  sampleRate: number;
  silenceThresholdEnergy: number;
  silenceDurationMs: number;
  minSpeechDurationMs: number;
  maxBufferDurationMs: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  sampleRate: 16_000,
  silenceThresholdEnergy: 0.01,
  silenceDurationMs: 800,
  minSpeechDurationMs: 200,
  maxBufferDurationMs: 30_000,
};
