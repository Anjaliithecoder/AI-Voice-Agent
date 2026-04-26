import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallSession } from './call-session';
import type { VoiceTransport } from './transport/transport.interface';
import { EVENTS } from '@voiceforge/shared';

// ── Mock factories ──────────────────────────────────────────────────────────

function createMockTransport(overrides: Partial<VoiceTransport> = {}): VoiceTransport {
  const handlers: {
    onAudioFrame?: (pcm: Buffer) => void;
    onBargeIn?: () => void;
    onEnd?: (reason: string) => void;
  } = {};

  return {
    callId: 'test-call-id',
    inboundAudioFormat: 'pcm_16khz',
    outboundAudioFormat: 'mp3',
    onAudioFrame: vi.fn((handler) => {
      handlers.onAudioFrame = handler;
    }),
    onBargeIn: vi.fn((handler) => {
      handlers.onBargeIn = handler;
    }),
    onEnd: vi.fn((handler) => {
      handlers.onEnd = handler;
    }),
    sendAgentAudio: vi.fn().mockResolvedValue(undefined),
    sendEvent: vi.fn(),
    clearOutput: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockStt() {
  return {
    transcribe: vi.fn().mockResolvedValue({ text: 'hello', durationMs: 100 }),
  };
}

function createMockLlm() {
  return {
    completeStreaming: vi.fn().mockResolvedValue({
      text: 'Hello, how can I help?',
      toolCalls: [],
      durationMs: 200,
    }),
  };
}

function createMockTts() {
  return {
    synthesizeStreaming: vi.fn().mockResolvedValue(undefined),
    charsUsed: 0,
  };
}

function createMockTools() {
  return {
    invoke: vi.fn().mockReturnValue({
      ok: true,
      data: {},
      summary: 'mock result',
    }),
  };
}

describe('CallSession', () => {
  let transport: ReturnType<typeof createMockTransport>;
  let stt: ReturnType<typeof createMockStt>;
  let llm: ReturnType<typeof createMockLlm>;
  let tts: ReturnType<typeof createMockTts>;
  let tools: ReturnType<typeof createMockTools>;
  let onEnded: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    transport = createMockTransport();
    stt = createMockStt();
    llm = createMockLlm();
    tts = createMockTts();
    tools = createMockTools();
    onEnded = vi.fn();
  });

  function createSession(): CallSession {
    return new CallSession(
      transport as unknown as VoiceTransport,
      { stt, llm, tts, tools } as never,
      onEnded,
    );
  }

  describe('constructor', () => {
    it('sets callId from transport', () => {
      const session = createSession();
      expect(session.callId).toBe('test-call-id');
    });

    it('registers transport event handlers', () => {
      createSession();
      expect(transport.onAudioFrame).toHaveBeenCalledOnce();
      expect(transport.onBargeIn).toHaveBeenCalledOnce();
      expect(transport.onEnd).toHaveBeenCalledOnce();
    });
  });

  describe('start()', () => {
    it('emits CALL_STARTED event with callId and agentName', async () => {
      const session = createSession();
      await session.start();

      expect(transport.sendEvent).toHaveBeenCalledWith(
        EVENTS.CALL_STARTED,
        expect.objectContaining({
          callId: 'test-call-id',
          agentName: 'Arya',
        }),
      );
    });

    it('speaks the greeting via TTS', async () => {
      const session = createSession();
      await session.start();

      expect(tts.synthesizeStreaming).toHaveBeenCalled();
      // The first arg to synthesizeStreaming should be the greeting text
      const firstCallArgs = tts.synthesizeStreaming.mock.calls[0];
      expect(firstCallArgs[0]).toContain('CloudNest');
    });

    it('emits TRANSCRIPT_AGENT event with the greeting', async () => {
      const session = createSession();
      await session.start();

      const transcriptCalls = (transport.sendEvent as ReturnType<typeof vi.fn>).mock.calls
        .filter(([event]: [string]) => event === EVENTS.TRANSCRIPT_AGENT);
      expect(transcriptCalls.length).toBeGreaterThan(0);
      const greetingCall = transcriptCalls.find(
        ([, payload]: [string, { text: string; final: boolean }]) =>
          payload.final === true && payload.text.includes('CloudNest'),
      );
      expect(greetingCall).toBeDefined();
    });

    it('emits METRICS_TURN after greeting', async () => {
      const session = createSession();
      await session.start();

      const metricsCalls = (transport.sendEvent as ReturnType<typeof vi.fn>).mock.calls
        .filter(([event]: [string]) => event === EVENTS.METRICS_TURN);
      expect(metricsCalls.length).toBeGreaterThanOrEqual(1);
      const metrics = metricsCalls[0][1];
      expect(metrics).toHaveProperty('turnId');
      expect(metrics).toHaveProperty('sttMs', 0);
      expect(metrics).toHaveProperty('llmMs', 0);
    });
  });

  describe('handleBargeIn()', () => {
    it('does nothing when there is no current turn (idle state)', () => {
      const session = createSession();
      // Call without start — no current turn exists
      session.handleBargeIn();

      // AGENT_STOPPED should NOT have been emitted
      const stoppedCalls = (transport.sendEvent as ReturnType<typeof vi.fn>).mock.calls
        .filter(([event]: [string]) => event === EVENTS.AGENT_STOPPED);
      expect(stoppedCalls.length).toBe(0);
    });

    it('does nothing when state is Listening (after start)', async () => {
      const session = createSession();
      await session.start();

      // After start(), state is Listening and currentTurn is null.
      // handleBargeIn should be a no-op.
      session.handleBargeIn();

      // AGENT_STOPPED should NOT have been emitted from handleBargeIn
      // (it is only emitted during greeting or if speaking)
      const stoppedCalls = (transport.sendEvent as ReturnType<typeof vi.fn>).mock.calls
        .filter(
          ([event, payload]: [string, { reason: string }]) =>
            event === EVENTS.AGENT_STOPPED && payload.reason === 'interrupted',
        );
      expect(stoppedCalls.length).toBe(0);
    });

    it('does not call clearOutput when no turn is active', () => {
      const session = createSession();
      session.handleBargeIn();
      expect(transport.clearOutput).not.toHaveBeenCalled();
    });
  });

  describe('end()', () => {
    it('calls transport.end and invokes onEnded callback', async () => {
      const session = createSession();
      await session.end('user_ended');

      expect(transport.end).toHaveBeenCalledWith('user_ended');
      expect(onEnded).toHaveBeenCalledOnce();
    });

    it('is idempotent — calling end() twice only ends once', async () => {
      const session = createSession();
      await session.end('first');
      await session.end('second');

      expect(transport.end).toHaveBeenCalledTimes(1);
      expect(onEnded).toHaveBeenCalledTimes(1);
    });

    it('aborts the current turn if one is active', async () => {
      let ttsResolve: () => void;
      const ttsPromise = new Promise<void>((resolve) => {
        ttsResolve = resolve;
      });
      tts.synthesizeStreaming.mockImplementation(async () => {
        await ttsPromise;
      });

      const session = createSession();
      const startPromise = session.start();

      // Wait for state to transition
      await new Promise((resolve) => setTimeout(resolve, 10));

      await session.end('user_ended');

      // transport.end should have been called
      expect(transport.end).toHaveBeenCalledWith('user_ended');

      ttsResolve!();
      await startPromise;
    });

    it('uses default reason when none provided', async () => {
      const session = createSession();
      await session.end();
      expect(transport.end).toHaveBeenCalledWith('user_ended');
    });
  });

  describe('transport with pcm_16khz output format', () => {
    it('sets ttsFormat to pcm_16khz when transport specifies it', async () => {
      const pcmTransport = createMockTransport({
        outboundAudioFormat: 'pcm_16khz',
      });

      const session = new CallSession(
        pcmTransport as unknown as VoiceTransport,
        { stt, llm, tts, tools } as never,
        onEnded,
      );

      await session.start();

      // The last argument to synthesizeStreaming should be 'pcm_16khz'
      const ttsCall = tts.synthesizeStreaming.mock.calls[0];
      expect(ttsCall[3]).toBe('pcm_16khz');
    });
  });
});
