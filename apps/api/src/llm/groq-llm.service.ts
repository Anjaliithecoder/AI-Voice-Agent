import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Message, ToolCall } from '@voiceforge/shared';

const GROQ_LLM_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const REQUEST_TIMEOUT_MS = 30_000;

export interface StreamCallbacks {
  /** Fires once per token batch with the incremental delta. */
  onDelta: (delta: string) => void | Promise<void>;
  /**
   * Fires whenever the running text crosses a sentence boundary.
   * Used to dispatch each sentence to TTS as soon as it's complete,
   * instead of waiting for the full LLM response.
   */
  onSentence: (sentence: string) => void | Promise<void>;
}

export interface CompletionResult {
  text: string;
  toolCalls: ToolCall[];
  durationMs: number;
}

interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

@Injectable()
export class GroqLlmService {
  private readonly logger = new Logger(GroqLlmService.name);
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('GROQ_API_KEY');
  }

  async completeStreaming(
    messages: Message[],
    tools: unknown[],
    cb: StreamCallbacks,
    abortSignal?: AbortSignal,
  ): Promise<CompletionResult> {
    const start = Date.now();

    const body = {
      model: MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.4,
      max_tokens: 512,
      stream: true,
    };

    const ac = new AbortController();
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => ac.abort());
    }
    const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await this.fetchWithRetry(body, ac.signal);
      if (!res.body) throw new Error('LLM response has no body');

      const result = await this.consumeSse(res.body, cb);
      return { ...result, durationMs: Date.now() - start };
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchWithRetry(
    body: unknown,
    signal: AbortSignal,
  ): Promise<Response> {
    const delays = [0, 500, 1500];
    let lastErr: unknown;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt] > 0) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
      try {
        const res = await fetch(GROQ_LLM_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal,
        });
        if (res.ok) return res;
        if (res.status === 429 && attempt < delays.length - 1) {
          this.logger.warn('LLM 429 — backing off');
          continue;
        }
        const errText = await res.text();
        throw new Error(`Groq LLM ${res.status}: ${errText.slice(0, 300)}`);
      } catch (err) {
        lastErr = err;
        if (signal.aborted) throw new Error('LLM request aborted');
        if (attempt === delays.length - 1) throw err;
      }
    }
    throw lastErr ?? new Error('LLM failed after retries');
  }

  private async consumeSse(
    stream: ReadableStream<Uint8Array>,
    cb: StreamCallbacks,
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assembled = '';
    let sentenceCursor = 0;
    const toolAcc = new Map<number, ToolCallAccumulator>();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;

          let parsed: GroqStreamChunk;
          try {
            parsed = JSON.parse(payload);
          } catch {
            this.logger.warn(`Bad SSE payload: ${payload.slice(0, 80)}`);
            continue;
          }

          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            assembled += delta.content;
            await cb.onDelta(delta.content);

            const remaining = assembled.slice(sentenceCursor);
            const boundary = findSentenceBoundary(remaining);
            if (boundary !== -1) {
              const sentence = remaining.slice(0, boundary + 1).trim();
              if (sentence.length > 0) {
                await cb.onSentence(sentence);
              }
              sentenceCursor += boundary + 1;
            }
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const existing = toolAcc.get(idx) ?? {
                id: '',
                name: '',
                arguments: '',
              };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments)
                existing.arguments += tc.function.arguments;
              toolAcc.set(idx, existing);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const tail = assembled.slice(sentenceCursor).trim();
    if (tail.length > 0) {
      await cb.onSentence(tail);
    }

    const toolCalls: ToolCall[] = Array.from(toolAcc.values())
      .filter((t) => t.name)
      .map((t) => ({
        id: t.id || `call_${Math.random().toString(36).slice(2, 10)}`,
        type: 'function' as const,
        function: { name: t.name, arguments: t.arguments || '{}' },
      }));

    return { text: assembled, toolCalls };
  }
}

interface GroqStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
}

/**
 * Find the last sentence-terminating punctuation in `text`.
 * Returns the index of that char, or -1 if none.
 * We look at the LAST boundary so we flush as much as possible at once.
 */
function findSentenceBoundary(text: string): number {
  let last = -1;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '.' || c === '!' || c === '?' || c === '\n') {
      // Avoid breaking on common decimal or abbreviation patterns.
      const next = text[i + 1];
      if (c === '.' && next && /[0-9]/.test(next)) continue;
      last = i;
    }
  }
  return last;
}
