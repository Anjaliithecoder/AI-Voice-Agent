import { Module } from '@nestjs/common';
import { ElevenLabsTtsService } from './elevenlabs-tts.service';

@Module({
  providers: [ElevenLabsTtsService],
  exports: [ElevenLabsTtsService],
})
export class TtsModule {}
