import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const MODEL = 'eleven_flash_v2_5';
const SOFT_QUOTA_WARN_CHARS = 9_000;

/**
 * - 'mp3'        : mp3_44100_64, browser plays directly
 * - 'pcm_16khz'  : raw int16 LE PCM @ 16kHz mono, for telephony pipeline
 */
export type ElevenLabsOutputFormat = 'mp3' | 'pcm_16khz';

const FORMAT_QS: Record<ElevenLabsOutputFormat, { qs: string; accept: string }> = {
  mp3: { qs: 'mp3_44100_64', accept: 'audio/mpeg' },
  pcm_16khz: { qs: 'pcm_16000', accept: 'audio/pcm' },
};

@Injectable()
export class ElevenLabsTtsService {
  private readonly logger = new Logger(ElevenLabsTtsService.name);
  private readonly apiKey: string;
  private readonly voiceId: string;
  private cumulativeChars = 0;

  constructor(config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('ELEVENLABS_API_KEY');
    this.voiceId = config.getOrThrow<string>('ELEVENLABS_VOICE_ID');
  }

  get charsUsed(): number {
    return this.cumulativeChars;
  }

  async synthesizeStreaming(
    text: string,
    onChunk: (chunk: Buffer) => void | Promise<void>,
    abortSignal?: AbortSignal,
    format: ElevenLabsOutputFormat = 'mp3',
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    this.cumulativeChars += trimmed.length;
    if (this.cumulativeChars > SOFT_QUOTA_WARN_CHARS) {
      this.logger.warn(
        `ElevenLabs usage at ${this.cumulativeChars} chars — approaching free tier (10k/mo)`,
      );
    }

    const { qs, accept } = FORMAT_QS[format];
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream?output_format=${qs}`;
    const body = {
      text: trimmed,
      model_id: MODEL,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: accept,
      },
      body: JSON.stringify(body),
      signal: abortSignal,
    });

    if (!res.ok) {
      const errText = await res.text();
      const err = new Error(
        `ElevenLabs ${res.status}: ${errText.slice(0, 200)}`,
      );
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }

    if (!res.body) throw new Error('TTS response has no body');

    const reader = res.body.getReader();
    try {
      while (true) {
        if (abortSignal?.aborted) {
          // allow the stream to abort cleanly
          await reader.cancel().catch(() => undefined);
          return;
        }
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          await onChunk(Buffer.from(value));
        }
      }
    } catch (err) {
      if (abortSignal?.aborted) return;
      throw err;
    } finally {
      reader.releaseLock();
    }
  }
}
