import { Logger } from '@nestjs/common';
import type { WebSocket } from 'ws';
import type { EventName } from '@voiceforge/shared';
import { AudioAdapter } from '../../audio/audio-adapter';
import type {
  OutboundAudioFormat,
  VoiceTransport,
} from './transport.interface';

/** 20 ms @ 8 kHz μ-law = 160 bytes per frame. */
const FRAME_BYTES = 160;

/**
 * Twilio Media Streams transport.
 *
 * Wire protocol (https://www.twilio.com/docs/voice/twiml/stream):
 *   - Twilio → us :  { event: 'media',   media: { payload: <base64 μ-law> } }
 *   - us → Twilio :  { event: 'media',   streamSid, media: { payload: <base64 μ-law> } }
 *   - us → Twilio :  { event: 'clear',   streamSid }
 *   - us → Twilio :  { event: 'mark',    streamSid, mark: { name } }
 *
 * Inbound  μ-law 8 kHz frames are decoded → upsampled → PCM 16 kHz
 *          (matching the browser path; STT sees identical input).
 * Outbound TTS PCM 16 kHz is downsampled → μ-law 8 kHz → split into
 *          160-byte frames → base64 → JSON.
 */
export class TwilioTransport implements VoiceTransport {
  readonly callId: string;
  readonly inboundAudioFormat = 'pcm_16khz' as const;
  readonly outboundAudioFormat: OutboundAudioFormat = 'pcm_16khz';

  private readonly logger: Logger;

  private audioHandler?: (pcm: Buffer) => void;
  private bargeInHandler?: () => void;
  private endHandler?: (reason: string) => void;
  private ended = false;

  /** Carry-over μ-law bytes that didn't fill a full 160-byte frame. */
  private mulawTail: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  constructor(
    private readonly socket: WebSocket,
    private readonly streamSid: string,
    callSid: string,
  ) {
    this.callId = callSid;
    this.logger = new Logger(`Twilio[${callSid.slice(0, 8)}]`);
  }

  /** Called by the gateway with a raw 20ms μ-law frame from Twilio. */
  feedMulaw(mulaw: Buffer): void {
    if (!this.audioHandler) return;
    const pcm16k = AudioAdapter.mulaw8kToPcm16k(mulaw);
    this.audioHandler(pcm16k);
  }

  /** No explicit barge-in event from Twilio — left for parity with the interface. */
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

  async sendAgentAudio(chunk: Buffer): Promise<void> {
    if (this.ended || this.socket.readyState !== this.socket.OPEN) return;

    // PCM 16 kHz → μ-law 8 kHz, then frame to 160-byte chunks.
    const mulaw = AudioAdapter.pcm16kToMulaw8k(chunk);
    const stream =
      this.mulawTail.length > 0 ? Buffer.concat([this.mulawTail, mulaw]) : mulaw;

    let offset = 0;
    while (stream.length - offset >= FRAME_BYTES) {
      const frame = stream.subarray(offset, offset + FRAME_BYTES);
      this.socket.send(
        JSON.stringify({
          event: 'media',
          streamSid: this.streamSid,
          media: { payload: frame.toString('base64') },
        }),
      );
      offset += FRAME_BYTES;
    }
    this.mulawTail = stream.subarray(offset);
  }

  /**
   * Control events have no UI on a phone call, but we still log them
   * (Phase B will persist transcripts/metrics to Postgres from here).
   */
  sendEvent<E extends EventName>(event: E, payload: unknown): void {
    if (this.ended) return;
    this.logger.debug(JSON.stringify({ event, ...(payload as object) }));
  }

  async clearOutput(): Promise<void> {
    if (this.ended || this.socket.readyState !== this.socket.OPEN) return;
    this.mulawTail = Buffer.alloc(0);
    this.socket.send(
      JSON.stringify({ event: 'clear', streamSid: this.streamSid }),
    );
  }

  async end(reason = 'closed'): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    try {
      if (this.socket.readyState === this.socket.OPEN) {
        this.socket.close();
      }
    } catch {
      // ignore
    }
    this.endHandler?.(reason);
  }
}
