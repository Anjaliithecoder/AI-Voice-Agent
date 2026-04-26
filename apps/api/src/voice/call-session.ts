import { Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import {
  CallState,
  EVENTS,
  type Message,
  type MetricsTurnPayload,
  type ToolInvokedPayload,
  type ErrorCode,
} from '@voiceforge/shared';
import { GroqSttService } from '../stt/groq-stt.service';
import { GroqLlmService } from '../llm/groq-llm.service';
import {
  ElevenLabsTtsService,
  type ElevenLabsOutputFormat,
} from '../tts/elevenlabs-tts.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { SYSTEM_PROMPT, GREETING } from '../llm/prompts';
import { TOOL_SCHEMAS } from '../llm/tools';
import { pcmRmsEnergy } from '../audio/wav-utils';
import {
  DEFAULT_SESSION_CONFIG,
  type SessionConfig,
  type TurnContext,
} from './types';
import type { VoiceTransport } from './transport/transport.interface';

interface Deps {
  stt: GroqSttService;
  llm: GroqLlmService;
  tts: ElevenLabsTtsService;
  tools: ToolRegistryService;
}

export class CallSession {
  readonly callId: string;
  private readonly logger: Logger;
  private readonly transport: VoiceTransport;
  private readonly deps: Deps;
  private readonly cfg: SessionConfig;
  private readonly ttsFormat: ElevenLabsOutputFormat;

  private state: CallState = CallState.Idle;
  private history: Message[];
  private audioBuffer: Buffer[] = [];
  private audioBufferBytes = 0;

  // VAD state
  private speechStartedAt: number | null = null;
  private lastSpeechAt: number | null = null;
  private isProcessing = false;

  private currentTurn: TurnContext | null = null;
  private endRequested = false;

  private readonly onEnded: () => void;

  constructor(
    transport: VoiceTransport,
    deps: Deps,
    onEnded: () => void = () => undefined,
  ) {
    this.callId = transport.callId;
    this.transport = transport;
    this.deps = deps;
    this.onEnded = onEnded;
    this.cfg = DEFAULT_SESSION_CONFIG;
    this.logger = new Logger(`CallSession[${this.callId.slice(0, 8)}]`);
    this.history = [{ role: 'system', content: SYSTEM_PROMPT }];
    this.ttsFormat =
      transport.outboundAudioFormat === 'pcm_16khz' ? 'pcm_16khz' : 'mp3';

    transport.onAudioFrame((chunk) => this.onAudioChunk(chunk));
    transport.onBargeIn(() => this.handleBargeIn());
    transport.onEnd((reason) => void this.end(reason));
  }

  async start(): Promise<void> {
    this.state = CallState.Connecting;
    this.transport.sendEvent(EVENTS.CALL_STARTED, {
      callId: this.callId,
      agentName: 'Arya',
    });
    this.logger.log(JSON.stringify({ event: 'call_started', callId: this.callId }));
    await this.speakGreeting();
    this.state = CallState.Listening;
  }

  private async speakGreeting(): Promise<void> {
    const turnId = uuid();
    const turn: TurnContext = {
      id: turnId,
      startedAt: Date.now(),
      sttMs: 0,
      llmMs: 0,
      ttsMs: 0,
      abort: new AbortController(),
    };
    this.currentTurn = turn;
    this.history.push({ role: 'assistant', content: GREETING });

    this.transport.sendEvent(EVENTS.TRANSCRIPT_AGENT, {
      text: GREETING,
      final: true,
      turnId,
    });
    await this.streamTts(GREETING, turn);

    const totalMs = Date.now() - turn.startedAt;
    const metrics: MetricsTurnPayload = {
      turnId,
      sttMs: 0,
      llmMs: 0,
      ttsMs: turn.ttsMs,
      totalMs,
    };
    this.transport.sendEvent(EVENTS.METRICS_TURN, metrics);
    this.currentTurn = null;
  }

  private onAudioChunk(chunk: Buffer): void {
    if (this.state === CallState.Ended) return;

    // Append always; even if processing, keep buffering for the next turn.
    this.audioBuffer.push(chunk);
    this.audioBufferBytes += chunk.length;

    // Cap buffer to prevent unbounded growth.
    const maxBytes =
      (this.cfg.sampleRate * 2 * this.cfg.maxBufferDurationMs) / 1000;
    while (this.audioBufferBytes > maxBytes && this.audioBuffer.length > 0) {
      const dropped = this.audioBuffer.shift();
      this.audioBufferBytes -= dropped?.length ?? 0;
    }

    // Energy-based VAD on this chunk.
    const energy = pcmRmsEnergy(chunk);
    const now = Date.now();

    if (energy >= this.cfg.silenceThresholdEnergy) {
      if (this.speechStartedAt === null) {
        this.speechStartedAt = now;
      }
      this.lastSpeechAt = now;
    }

    // If we're not yet in a turn but user has begun speaking while agent is talking,
    // this is implicit barge-in (in addition to any explicit barge-in event).
    if (
      this.state === CallState.Speaking &&
      this.speechStartedAt !== null &&
      now - this.speechStartedAt > 150
    ) {
      this.handleBargeIn();
    }

    // Trigger turn processing when speech ended (silence after speech).
    if (
      !this.isProcessing &&
      this.state === CallState.Listening &&
      this.speechStartedAt !== null &&
      this.lastSpeechAt !== null &&
      now - this.lastSpeechAt >= this.cfg.silenceDurationMs &&
      this.lastSpeechAt - this.speechStartedAt >= this.cfg.minSpeechDurationMs
    ) {
      void this.processTurn();
    }
  }

  handleBargeIn(): void {
    if (!this.currentTurn) return;
    if (this.state !== CallState.Speaking) return;
    this.logger.debug(`barge-in on turn ${this.currentTurn.id}`);
    this.currentTurn.abort.abort();
    this.transport.sendEvent(EVENTS.AGENT_STOPPED, {
      turnId: this.currentTurn.id,
      reason: 'interrupted',
    });
    void this.transport.clearOutput();
    this.state = CallState.Listening;
    this.currentTurn = null;
  }

  private async processTurn(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const pcm = Buffer.concat(this.audioBuffer);
    this.audioBuffer = [];
    this.audioBufferBytes = 0;
    this.speechStartedAt = null;
    this.lastSpeechAt = null;

    const turnId = uuid();
    const turn: TurnContext = {
      id: turnId,
      startedAt: Date.now(),
      sttMs: 0,
      llmMs: 0,
      ttsMs: 0,
      abort: new AbortController(),
    };
    this.currentTurn = turn;

    try {
      this.state = CallState.Thinking;

      // ── STT ───────────────────────────────────────────────────────────
      const stt = await this.deps.stt.transcribe(pcm, this.cfg.sampleRate);
      turn.sttMs = stt.durationMs;
      const userText = stt.text.trim();

      this.logger.log(
        JSON.stringify({
          event: 'stt',
          callId: this.callId,
          turnId,
          ms: stt.durationMs,
          text: userText,
        }),
      );

      if (!userText) {
        this.logger.debug('empty transcript — ignoring turn');
        this.state = CallState.Listening;
        this.currentTurn = null;
        return;
      }

      this.transport.sendEvent(EVENTS.TRANSCRIPT_USER, {
        text: userText,
        final: true,
        turnId,
      });
      this.history.push({ role: 'user', content: userText });

      // ── LLM (with tool loop) ──────────────────────────────────────────
      const llmStart = Date.now();
      const agentText = await this.runLlmWithTools(turn);
      turn.llmMs = Date.now() - llmStart - turn.ttsMs;
      // ttsMs accumulates inside runLlmWithTools as sentences are streamed.

      this.history.push({ role: 'assistant', content: agentText });

      this.transport.sendEvent(EVENTS.TRANSCRIPT_AGENT, {
        text: agentText,
        final: true,
        turnId,
      });

      this.transport.sendEvent(EVENTS.AGENT_AUDIO_END, { turnId });
      this.transport.sendEvent(EVENTS.AGENT_STOPPED, {
        turnId,
        reason: 'finished',
      });

      // ── Metrics ────────────────────────────────────────────────────────
      const totalMs = Date.now() - turn.startedAt;
      const metrics: MetricsTurnPayload = {
        turnId,
        sttMs: turn.sttMs,
        llmMs: turn.llmMs,
        ttsMs: turn.ttsMs,
        totalMs,
      };
      this.transport.sendEvent(EVENTS.METRICS_TURN, metrics);
      this.logger.log(
        JSON.stringify({ event: 'turn_done', callId: this.callId, ...metrics }),
      );
    } catch (err) {
      if (turn.abort.signal.aborted) {
        this.logger.debug(`turn ${turnId} aborted`);
      } else {
        const msg = err instanceof Error ? err.message : 'unknown';
        this.logger.error(`turn ${turnId} failed: ${msg}`);
        this.emitError(this.classifyError(err), msg);
      }
    } finally {
      this.isProcessing = false;
      if (this.state !== CallState.Ended) {
        this.state = CallState.Listening;
      }
      this.currentTurn = null;
    }
  }

  private async runLlmWithTools(turn: TurnContext): Promise<string> {
    let assembledFinal = '';
    let endsCallAfter = false;

    for (let iteration = 0; iteration < 3; iteration += 1) {
      let agentSpeakingEmitted = false;
      const sentenceQueue: Promise<void> = Promise.resolve();
      let queueChain = sentenceQueue;

      const { text, toolCalls } = await this.deps.llm.completeStreaming(
        this.history,
        TOOL_SCHEMAS,
        {
          onDelta: (delta) => {
            this.transport.sendEvent(EVENTS.TRANSCRIPT_AGENT, {
              text: '',
              delta,
              final: false,
              turnId: turn.id,
            });
          },
          onSentence: (sentence) => {
            // Serialise TTS so chunks for sentence N+1 don't beat sentence N.
            queueChain = queueChain.then(async () => {
              if (turn.abort.signal.aborted) return;
              if (!agentSpeakingEmitted) {
                this.state = CallState.Speaking;
                this.transport.sendEvent(EVENTS.AGENT_SPEAKING, {
                  turnId: turn.id,
                });
                agentSpeakingEmitted = true;
              }
              const ttsStart = Date.now();
              await this.streamTts(sentence, turn);
              turn.ttsMs += Date.now() - ttsStart;
            });
          },
        },
        turn.abort.signal,
      );

      // Wait for all queued TTS work for this LLM iteration to finish.
      await queueChain;

      if (toolCalls.length === 0) {
        assembledFinal = text;
        break;
      }

      // Append the assistant's tool-call message, then execute each tool and
      // append the result so the next LLM iteration can use it.
      this.history.push({
        role: 'assistant',
        content: text || null,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(call.function.arguments) as Record<
            string,
            unknown
          >;
        } catch {
          this.logger.warn(`bad tool args: ${call.function.arguments}`);
        }

        const result = this.deps.tools.invoke(call.function.name, parsedArgs);
        if (result.endsCall) endsCallAfter = true;

        const payload: ToolInvokedPayload = {
          name: call.function.name,
          args: parsedArgs,
          result: result.data,
          turnId: turn.id,
        };
        this.transport.sendEvent(EVENTS.TOOL_INVOKED, payload);
        this.logger.log(
          JSON.stringify({
            event: 'tool_invoked',
            callId: this.callId,
            turnId: turn.id,
            name: call.function.name,
            ok: result.ok,
          }),
        );

        this.history.push({
          role: 'tool',
          content: JSON.stringify({
            ok: result.ok,
            summary: result.summary,
            data: result.data,
          }),
          tool_call_id: call.id,
          name: call.function.name,
        });
      }

      if (turn.abort.signal.aborted) break;
      // Loop again so the model can speak about the tool results.
    }

    if (endsCallAfter) {
      // Emit a graceful end after the model's farewell finishes streaming.
      setTimeout(() => void this.end('agent_handoff'), 500);
    }

    return assembledFinal;
  }

  private async streamTts(text: string, turn: TurnContext): Promise<void> {
    if (turn.abort.signal.aborted) return;
    try {
      await this.deps.tts.synthesizeStreaming(
        text,
        async (chunk) => {
          if (turn.abort.signal.aborted) return;
          await this.transport.sendAgentAudio(chunk);
        },
        turn.abort.signal,
        this.ttsFormat,
      );
    } catch (err) {
      if (turn.abort.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`TTS failed: ${msg}`);
      const code: ErrorCode =
        (err as { status?: number }).status === 401
          ? 'TTS_QUOTA_EXCEEDED'
          : 'TTS_FAILED';
      this.emitError(code, msg);
    }
  }

  async end(reason = 'user_ended'): Promise<void> {
    if (this.endRequested) return;
    this.endRequested = true;
    this.state = CallState.Ended;
    if (this.currentTurn) {
      this.currentTurn.abort.abort();
    }
    this.logger.log(
      JSON.stringify({ event: 'call_ended', callId: this.callId, reason }),
    );
    await this.transport.end(reason).catch(() => undefined);
    this.onEnded();
  }

  private emitError(code: ErrorCode, message: string): void {
    this.transport.sendEvent(EVENTS.ERROR, {
      code,
      message,
      recoverable: code !== 'TTS_QUOTA_EXCEEDED',
    });
  }

  private classifyError(err: unknown): ErrorCode {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('STT')) return 'STT_FAILED';
    if (msg.includes('LLM')) return msg.includes('429') ? 'LLM_RATE_LIMIT' : 'LLM_FAILED';
    if (msg.includes('TTS') || msg.includes('ElevenLabs')) return 'TTS_FAILED';
    return 'UNKNOWN';
  }
}
