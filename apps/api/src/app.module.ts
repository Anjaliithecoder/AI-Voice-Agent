import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { join } from 'node:path';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';
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
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    HealthModule,
    SttModule,
    LlmModule,
    TtsModule,
    ToolsModule,
    VoiceModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
