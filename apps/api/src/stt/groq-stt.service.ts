import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pcmToWav } from '../audio/wav-utils';

export interface TranscriptionResult {
  text: string;
  durationMs: number;
}

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';
const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class GroqSttService {
  private readonly logger = new Logger(GroqSttService.name);
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('GROQ_API_KEY');
  }

  async transcribe(
    pcm: Buffer,
    sampleRate: number,
  ): Promise<TranscriptionResult> {
    const start = Date.now();
    const wav = pcmToWav(pcm, sampleRate);

    const form = new FormData();
    // Copy Buffer into a fresh ArrayBuffer so the Blob constructor's strict
    // BlobPart type accepts it (Node's Buffer can be backed by SharedArrayBuffer).
    const ab = new ArrayBuffer(wav.length);
    new Uint8Array(ab).set(wav);
    form.append('file', new Blob([ab], { type: 'audio/wav' }), 'speech.wav');
    form.append('model', MODEL);
    form.append('response_format', 'json');
    form.append('language', 'en');
    form.append('temperature', '0');

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await this.fetchWithRetry(form, ac.signal);
      const json = (await res.json()) as { text?: string };
      const text = (json.text ?? '').trim();
      const durationMs = Date.now() - start;
      this.logger.debug(
        `STT done in ${durationMs}ms — "${text.slice(0, 80)}"`,
      );
      return { text, durationMs };
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchWithRetry(
    form: FormData,
    signal: AbortSignal,
  ): Promise<Response> {
    const delays = [0, 500, 1500];
    let lastErr: unknown;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt] > 0) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
      try {
        const res = await fetch(GROQ_STT_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}` },
          body: form,
          signal,
        });
        if (res.ok) return res;
        const body = await res.text();
        if (res.status === 429 && attempt < delays.length - 1) {
          this.logger.warn(`STT 429 (rate limit), retrying`);
          continue;
        }
        throw new Error(`Groq STT ${res.status}: ${body.slice(0, 200)}`);
      } catch (err) {
        lastErr = err;
        if (signal.aborted) {
          throw new Error('STT request timed out');
        }
        if (attempt === delays.length - 1) throw err;
      }
    }
    throw lastErr ?? new Error('STT failed after retries');
  }
}
