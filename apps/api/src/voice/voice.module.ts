import { Module } from '@nestjs/common';
import { VoiceGateway } from './voice.gateway';
import { TwilioGateway } from './twilio.gateway';
import { VoiceController } from './voice.controller';
import { CallSessionManager } from './call-session.manager';
import { SttModule } from '../stt/stt.module';
import { LlmModule } from '../llm/llm.module';
import { TtsModule } from '../tts/tts.module';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [SttModule, LlmModule, TtsModule, ToolsModule],
  controllers: [VoiceController],
  providers: [VoiceGateway, TwilioGateway, CallSessionManager],
  exports: [TwilioGateway],
})
export class VoiceModule {}
