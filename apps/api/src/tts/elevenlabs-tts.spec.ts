import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElevenLabsTtsService } from './elevenlabs-tts.service';

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockConfigService() {
  return {
    get: vi.fn((key: string) => {
      const map: Record<string, string> = {
        ELEVENLABS_API_KEY: 'test-el-api-key',
        ELEVENLABS_VOICE_ID: 'test-voice-id',
      };
      return map[key];
    }),
    getOrThrow: vi.fn((key: string) => {
      const map: Record<string, string> = {
        ELEVENLABS_API_KEY: 'test-el-api-key',
        ELEVENLABS_VOICE_ID: 'test-voice-id',
      };
      if (map[key]) return map[key];
      throw new Error(`Missing config: ${key}`);
    }),
  };
}

function createStreamingResponse(chunks: Uint8Array[]): Response {
  let chunkIndex = 0;

  const readableStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(chunks[chunkIndex]);
        chunkIndex++;
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: true,
    status: 200,
    body: readableStream,
    headers: new Headers(),
    bodyUsed: false,
    redirected: false,
    statusText: 'OK',
    type: 'basic',
    url: '',
    clone: vi.fn(),
    json: vi.fn(),
    text: vi.fn(),
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    bytes: vi.fn(),
  } as unknown as Response;
}

function createErrorResponse(status: number, message: string): Response {
  return {
    ok: false,
    status,
    body: null,
    headers: new Headers(),
    bodyUsed: false,
    redirected: false,
    statusText: 'Error',
    type: 'basic',
    url: '',
    clone: vi.fn(),
    json: vi.fn().mockResolvedValue({ error: message }),
    text: vi.fn().mockResolvedValue(message),
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    bytes: vi.fn(),
  } as unknown as Response;
}

describe('ElevenLabsTtsService', () => {
  let service: ElevenLabsTtsService;
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const config = createMockConfigService();
    service = new ElevenLabsTtsService(config as never);
  });

  afterEach(() => {
    vi.stubGlobal('fetch', originalFetch);
    vi.restoreAllMocks();
  });

  describe('synthesizeStreaming', () => {
    it('calls onChunk with audio data from the stream', async () => {
      const chunk1 = new Uint8Array([1, 2, 3, 4]);
      const chunk2 = new Uint8Array([5, 6, 7, 8]);
      fetchMock.mockResolvedValue(createStreamingResponse([chunk1, chunk2]));

      const onChunk = vi.fn();
      await service.synthesizeStreaming('Hello world', onChunk);

      expect(onChunk).toHaveBeenCalledTimes(2);
      // Check that we receive Buffer instances
      expect(Buffer.isBuffer(onChunk.mock.calls[0][0])).toBe(true);
      expect(Buffer.isBuffer(onChunk.mock.calls[1][0])).toBe(true);
      // Check data content
      expect(onChunk.mock.calls[0][0]).toEqual(Buffer.from([1, 2, 3, 4]));
      expect(onChunk.mock.calls[1][0]).toEqual(Buffer.from([5, 6, 7, 8]));
    });

    it('sends POST request to ElevenLabs API with correct URL', async () => {
      fetchMock.mockResolvedValue(
        createStreamingResponse([new Uint8Array([1])]),
      );

      await service.synthesizeStreaming('Test', vi.fn());

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://api.elevenlabs.io/v1/text-to-speech/test-voice-id/stream',
        ),
        expect.anything(),
      );
    });

    it('includes API key in request headers', async () => {
      fetchMock.mockResolvedValue(
        createStreamingResponse([new Uint8Array([1])]),
      );

      await service.synthesizeStreaming('Test', vi.fn());

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[1].headers['xi-api-key']).toBe('test-el-api-key');
    });

    it('sends correct request body with text, model, and voice settings', async () => {
      fetchMock.mockResolvedValue(
        createStreamingResponse([new Uint8Array([1])]),
      );

      await service.synthesizeStreaming('Hello there', vi.fn());

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.text).toBe('Hello there');
      expect(body.model_id).toBe('eleven_flash_v2_5');
      expect(body.voice_settings).toBeDefined();
      expect(body.voice_settings.stability).toBe(0.5);
      expect(body.voice_settings.similarity_boost).toBe(0.75);
    });

    it('uses mp3 format by default', async () => {
      fetchMock.mockResolvedValue(
        createStreamingResponse([new Uint8Array([1])]),
      );

      await service.synthesizeStreaming('Test', vi.fn());

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('output_format=mp3_44100_64');
    });

    it('uses pcm format when specified', async () => {
      fetchMock.mockResolvedValue(
        createStreamingResponse([new Uint8Array([1])]),
      );

      await service.synthesizeStreaming('Test', vi.fn(), undefined, 'pcm_16khz');

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('output_format=pcm_16000');
    });
  });

  describe('empty text', () => {
    it('returns immediately for empty string without calling fetch', async () => {
      const onChunk = vi.fn();
      await service.synthesizeStreaming('', onChunk);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(onChunk).not.toHaveBeenCalled();
    });

    it('returns immediately for whitespace-only string without calling fetch', async () => {
      const onChunk = vi.fn();
      await service.synthesizeStreaming('   ', onChunk);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(onChunk).not.toHaveBeenCalled();
    });
  });

  describe('char counter tracks usage', () => {
    it('starts with 0 chars used', () => {
      expect(service.charsUsed).toBe(0);
    });

    it('accumulates character count across multiple calls', async () => {
      fetchMock.mockResolvedValue(
        createStreamingResponse([new Uint8Array([1])]),
      );

      await service.synthesizeStreaming('Hello', vi.fn()); // 5 chars
      expect(service.charsUsed).toBe(5);

      await service.synthesizeStreaming('World!', vi.fn()); // 6 chars
      expect(service.charsUsed).toBe(11);
    });

    it('counts trimmed text length', async () => {
      fetchMock.mockResolvedValue(
        createStreamingResponse([new Uint8Array([1])]),
      );

      await service.synthesizeStreaming('  padded  ', vi.fn());
      // "padded" after trim = 6 chars
      expect(service.charsUsed).toBe(6);
    });

    it('does not count empty text', async () => {
      await service.synthesizeStreaming('', vi.fn());
      expect(service.charsUsed).toBe(0);
    });
  });

  describe('abort signal stops streaming', () => {
    it('stops reading stream when abort signal is triggered', async () => {
      // Create a stream that produces chunks slowly
      let _enqueueNext: (() => void) | undefined;
      const readableStream = new ReadableStream<Uint8Array>({
        start(controller) {
          // Enqueue one chunk immediately
          controller.enqueue(new Uint8Array([1, 2]));
          // Wait for signal to enqueue more
          _enqueueNext = () => {
            controller.enqueue(new Uint8Array([3, 4]));
            controller.close();
          };
        },
      });

      const response = {
        ok: true,
        status: 200,
        body: readableStream,
        headers: new Headers(),
      } as unknown as Response;

      fetchMock.mockResolvedValue(response);

      const ac = new AbortController();
      const onChunk = vi.fn();

      // Start streaming and abort after first chunk
      onChunk.mockImplementation(() => {
        ac.abort();
      });

      await service.synthesizeStreaming('Test', onChunk, ac.signal);

      // onChunk should have been called at most once (for the first chunk
      // before abort took effect) or possibly twice if the reader read both
      // before checking signal. The important thing is it stopped.
      expect(onChunk.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('passes abort signal to the fetch call', async () => {
      fetchMock.mockResolvedValue(
        createStreamingResponse([new Uint8Array([1])]),
      );

      const ac = new AbortController();
      await service.synthesizeStreaming('Test', vi.fn(), ac.signal);

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[1].signal).toBe(ac.signal);
    });

    it('returns cleanly when already aborted before streaming', async () => {
      const readableStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      const response = {
        ok: true,
        status: 200,
        body: readableStream,
        headers: new Headers(),
      } as unknown as Response;

      fetchMock.mockResolvedValue(response);

      const ac = new AbortController();
      ac.abort(); // Already aborted

      const onChunk = vi.fn();
      await service.synthesizeStreaming('Test', onChunk, ac.signal);

      // onChunk should not have been called since signal was already aborted
      expect(onChunk).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('throws an error with status for non-ok responses', async () => {
      fetchMock.mockResolvedValue(createErrorResponse(401, 'Unauthorized'));

      await expect(
        service.synthesizeStreaming('Hello', vi.fn()),
      ).rejects.toThrow('ElevenLabs 401');
    });

    it('throws an error when response has no body', async () => {
      const response = {
        ok: true,
        status: 200,
        body: null,
        headers: new Headers(),
      } as unknown as Response;
      fetchMock.mockResolvedValue(response);

      await expect(
        service.synthesizeStreaming('Hello', vi.fn()),
      ).rejects.toThrow('TTS response has no body');
    });

    it('attaches status code to error for quota exceeded (401)', async () => {
      fetchMock.mockResolvedValue(createErrorResponse(401, 'Quota exceeded'));

      try {
        await service.synthesizeStreaming('Hello', vi.fn());
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const error = err as Error & { status?: number };
        expect(error.status).toBe(401);
      }
    });
  });
});
