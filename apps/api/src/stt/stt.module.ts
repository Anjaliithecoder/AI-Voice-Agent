import { Module } from '@nestjs/common';
import { GroqSttService } from './groq-stt.service';

@Module({
  providers: [GroqSttService],
  exports: [GroqSttService],
})
export class SttModule {}
