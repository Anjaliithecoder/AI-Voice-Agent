import { Injectable, Logger } from '@nestjs/common';
import { CallSession } from './call-session';
import { GroqSttService } from '../stt/groq-stt.service';
import { GroqLlmService } from '../llm/groq-llm.service';
import { ElevenLabsTtsService } from '../tts/elevenlabs-tts.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import type { VoiceTransport } from './transport/transport.interface';

@Injectable()
export class CallSessionManager {
  private readonly logger = new Logger(CallSessionManager.name);
  private readonly sessions = new Map<string, CallSession>();

  constructor(
    private readonly stt: GroqSttService,
    private readonly llm: GroqLlmService,
    private readonly tts: ElevenLabsTtsService,
    private readonly tools: ToolRegistryService,
  ) {}

  async startCall(transport: VoiceTransport): Promise<CallSession> {
    const existing = this.sessions.get(transport.callId);
    if (existing) {
      this.logger.warn(`Replacing existing session for ${transport.callId}`);
      await existing.end('replaced');
      this.sessions.delete(transport.callId);
    }

    const session = new CallSession(
      transport,
      {
        stt: this.stt,
        llm: this.llm,
        tts: this.tts,
        tools: this.tools,
      },
      () => this.sessions.delete(transport.callId),
    );
    this.sessions.set(transport.callId, session);

    await session.start();
    return session;
  }

  async endCall(callId: string, reason = 'user_ended'): Promise<void> {
    const session = this.sessions.get(callId);
    if (!session) return;
    await session.end(reason);
    this.sessions.delete(callId);
  }

  getSession(callId: string): CallSession | undefined {
    return this.sessions.get(callId);
  }
}
