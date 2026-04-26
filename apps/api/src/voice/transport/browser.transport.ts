import { v4 as uuid } from 'uuid';
import type { Socket } from 'socket.io';
import { EVENTS, type EventName } from '@voiceforge/shared';
import type { OutboundAudioFormat, VoiceTransport } from './transport.interface';

/**
 * Wraps a Socket.IO socket to look like a {@link VoiceTransport}.
 *
 * - Inbound: browser already sends PCM 16kHz mono int16 LE via `audio:chunk`.
 * - Outbound: TTS still produces MP3 (browser plays directly via MediaSource).
 */
export class BrowserTransport implements VoiceTransport {
  readonly callId: string;
  readonly inboundAudioFormat = 'pcm_16khz' as const;
  readonly outboundAudioFormat: OutboundAudioFormat = 'mp3';

  private audioHandler?: (pcm: Buffer) => void;
  private bargeInHandler?: () => void;
  private endHandler?: (reason: string) => void;
  private ended = false;

  constructor(private readonly socket: Socket) {
    this.callId = uuid();
  }

  /** Called by the gateway when an `audio:chunk` arrives from the browser. */
  feedAudio(chunk: Buffer): void {
    this.audioHandler?.(chunk);
  }

  /** Called by the gateway when an explicit `user:barge_in` event arrives. */
  signalBargeIn(): void {
    this.bargeInHandler?.();
  }

  onAudioFrame(handler: (pcm16k: Buffer) => void): void {
    this.audioHandler = handler;
  }

  onBargeIn(handler: () => void): void {
    this.bargeInHandler = handler;
  }

  onEnd(handler: (reason: string) => void): void {
    this.endHandler = handler;
  }

  sendAgentAudio(chunk: Buffer): void {
    if (this.ended) return;
    // Browser expects MP3 chunks delivered as binary frames.
    this.socket.emit(EVENTS.AGENT_AUDIO_CHUNK, chunk);
  }

  sendEvent<E extends EventName>(event: E, payload: unknown): void {
    if (this.ended) return;
    this.socket.emit(event, payload);
  }

  async clearOutput(): Promise<void> {
    // No transport-side queue for the browser — the client decides what to play.
    // The agent:stopped event (sent by CallSession) tells the client to flush MediaSource.
  }

  async end(reason = 'closed'): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.endHandler?.(reason);
  }
}
