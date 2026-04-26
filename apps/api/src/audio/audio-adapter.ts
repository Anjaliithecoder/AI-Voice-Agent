import { mulawDecodeBuffer, mulawEncodeBuffer } from './mulaw';
import { downsample16to8, upsample8to16 } from './resample';

/**
 * Bidirectional bridge between telephony wire format (μ-law 8 kHz)
 * and the internal pipeline format (PCM 16 kHz mono int16 LE).
 */
export class AudioAdapter {
  /** Twilio inbound: μ-law 8 kHz → PCM 16 kHz (what STT expects). */
  static mulaw8kToPcm16k(mulaw: Buffer): Buffer {
    const pcm8k = mulawDecodeBuffer(mulaw);
    return upsample8to16(pcm8k);
  }

  /** Twilio outbound: PCM 16 kHz → μ-law 8 kHz (what Twilio expects). */
  static pcm16kToMulaw8k(pcm16k: Buffer): Buffer {
    const pcm8k = downsample16to8(pcm16k);
    return mulawEncodeBuffer(pcm8k);
  }
}
