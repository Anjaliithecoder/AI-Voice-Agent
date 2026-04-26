/**
 * WebSocket event protocol for VoiceForge.
 * Shared between API (NestJS) and Web (React) so the wire shape can never drift.
 */

export const EVENTS = {
  // client -> server
  CALL_START: 'call:start',
  CALL_END: 'call:end',
  AUDIO_CHUNK: 'audio:chunk',
  USER_BARGE_IN: 'user:barge_in',

  // server -> client
  CALL_STARTED: 'call:started',
  AGENT_AUDIO_CHUNK: 'agent:audio_chunk',
  AGENT_AUDIO_END: 'agent:audio_end',
  AGENT_SPEAKING: 'agent:speaking',
  AGENT_STOPPED: 'agent:stopped',
  TRANSCRIPT_USER: 'transcript:user',
  TRANSCRIPT_AGENT: 'transcript:agent',
  METRICS_TURN: 'metrics:turn',
  TOOL_INVOKED: 'tool:invoked',
  ERROR: 'error',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export const CallState = {
  Idle: 'idle',
  Connecting: 'connecting',
  Listening: 'listening',
  Thinking: 'thinking',
  Speaking: 'speaking',
  Ended: 'ended',
} as const;

export type CallState = (typeof CallState)[keyof typeof CallState];

// ── Client → Server ──────────────────────────────────────────────────────────
export interface CallStartPayload {
  agentId: string;
}

export interface CallEndPayload {
  reason?: string;
}

// audio:chunk is a raw ArrayBuffer; no JSON wrapper.

export interface UserBargeInPayload {
  /** client-side timestamp (ms) when VAD detected speech onset */
  at: number;
}

// ── Server → Client ──────────────────────────────────────────────────────────
export interface CallStartedPayload {
  callId: string;
  agentName: string;
}

export interface AgentAudioChunkPayload {
  // delivered as a binary frame; this interface documents the meta we may send first.
  turnId: string;
  mime: 'audio/mpeg';
}

export interface AgentAudioEndPayload {
  turnId: string;
}

export interface AgentSpeakingPayload {
  turnId: string;
}

export interface AgentStoppedPayload {
  turnId: string;
  reason: 'finished' | 'interrupted' | 'aborted';
}

export interface TranscriptUserPayload {
  text: string;
  final: boolean;
  turnId: string;
}

export interface TranscriptAgentPayload {
  text: string;
  delta?: string;
  final: boolean;
  turnId: string;
}

export interface MetricsTurnPayload {
  turnId: string;
  sttMs: number;
  llmMs: number;
  ttsMs: number;
  totalMs: number;
}

export interface ToolInvokedPayload {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  turnId: string;
}

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  recoverable: boolean;
}

export type ErrorCode =
  | 'STT_FAILED'
  | 'LLM_FAILED'
  | 'LLM_RATE_LIMIT'
  | 'TTS_FAILED'
  | 'TTS_QUOTA_EXCEEDED'
  | 'INVALID_AUDIO'
  | 'NO_ACTIVE_CALL'
  | 'UNKNOWN';

// ── Conversation primitives ──────────────────────────────────────────────────
export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: Role;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Turn {
  id: string;
  userText: string;
  agentText: string;
  metrics?: MetricsTurnPayload;
  tools: ToolInvokedPayload[];
  startedAt: number;
}
