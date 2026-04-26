import type {
  AgentAudioEndPayload,
  AgentSpeakingPayload,
  AgentStoppedPayload,
  CallStartedPayload,
  ErrorPayload,
  EventName,
  MetricsTurnPayload,
  ToolInvokedPayload,
  TranscriptAgentPayload,
  TranscriptUserPayload,
} from '@voiceforge/shared';

/**
 * Wire format the transport wants for outbound TTS audio.
 * - 'mp3'        : ElevenLabs default; browser plays directly via MediaSource
 * - 'pcm_16khz'  : raw int16 LE PCM @ 16kHz mono; transport handles further encoding
 *                   (e.g. downsample + μ-law for Twilio)
 */
export type OutboundAudioFormat = 'mp3' | 'pcm_16khz';

export interface ControlEventMap {
  'call:started': CallStartedPayload;
  'agent:audio_end': AgentAudioEndPayload;
  'agent:speaking': AgentSpeakingPayload;
  'agent:stopped': AgentStoppedPayload;
  'transcript:user': TranscriptUserPayload;
  'transcript:agent': TranscriptAgentPayload;
  'metrics:turn': MetricsTurnPayload;
  'tool:invoked': ToolInvokedPayload;
  error: ErrorPayload;
}

/**
 * Transport-agnostic port that CallSession talks to.
 *
 * One transport = one phone call (or one browser session).
 * Implementations:
 *   - BrowserTransport (Socket.IO; outbound MP3 to <audio>)
 *   - TwilioTransport  (raw WS; outbound μ-law 8kHz framed in 20ms)
 *   - ExotelTransport  (Phase D)
 */
export interface VoiceTransport {
  readonly callId: string;

  /** Inbound audio is always normalised to PCM 16kHz mono int16 LE before reaching CallSession. */
  readonly inboundAudioFormat: 'pcm_16khz';

  /** What CallSession should ask TTS to produce. */
  readonly outboundAudioFormat: OutboundAudioFormat;

  /** Streaming caller audio in PCM 16kHz mono int16 LE. */
  onAudioFrame(handler: (pcm16k: Buffer) => void): void;

  /** Explicit barge-in signal from the client (browser only; Twilio infers from energy). */
  onBargeIn(handler: () => void): void;

  /** Transport closed by remote side (caller hung up, browser disconnected). */
  onEnd(handler: (reason: string) => void): void;

  /**
   * Send a TTS audio chunk in {@link outboundAudioFormat}.
   * Implementation handles any further encoding (downsample, μ-law, framing, base64).
   */
  sendAgentAudio(chunk: Buffer): void | Promise<void>;

  /**
   * Send a control event. Browser transport forwards to Socket.IO; phone transports
   * typically log + persist (no UI surface to render to).
   */
  sendEvent<E extends EventName>(event: E, payload: unknown): void;

  /** Drop any in-flight outbound audio. Used on barge-in. */
  clearOutput(): Promise<void>;

  /** Tear down the transport. */
  end(reason?: string): Promise<void>;
}
