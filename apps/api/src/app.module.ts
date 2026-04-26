import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { envValidationSchema } from './config/env.validation';
import { VoiceModule } from './voice/voice.module';
import { SttModule } from './stt/stt.module';
import { LlmModule } from './llm/llm.module';
import { TtsModule } from './tts/tts.module';
import { ToolsModule } from './tools/tools.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Look in apps/api/.env first, then fall back to the workspace root .env.
      // Earlier entries take precedence.
      envFilePath: ['.env', join(__dirname, '..', '..', '..', '..', '.env')],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),
    SttModule,
    LlmModule,
    TtsModule,
    ToolsModule,
    VoiceModule,
  ],
})
export class AppModule {}
