import { Module } from '@nestjs/common';
import { GroqLlmService } from './groq-llm.service';

@Module({
  providers: [GroqLlmService],
  exports: [GroqLlmService],
})
export class LlmModule {}
