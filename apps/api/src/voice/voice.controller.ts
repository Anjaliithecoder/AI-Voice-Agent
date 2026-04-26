import { Controller, Header, Headers, Logger, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * HTTP endpoints called by the telephony provider (Twilio).
 *
 * Twilio calls POST /twilio/twiml when a call comes in. We respond with
 * <Connect><Stream/></Connect> TwiML pointing at our wss:// endpoint.
 *
 * NB: must NOT live under '/voice' — Socket.IO claims that prefix for its engine.
 */
@Controller('twilio')
export class VoiceController {
  private readonly logger = new Logger(VoiceController.name);

  constructor(private readonly config: ConfigService) {}

  @Post('twiml')
  @Header('Content-Type', 'text/xml')
  handleIncomingCall(@Headers('host') hostHeader?: string): string {
    // PUBLIC_HOST should be the externally-reachable hostname, e.g.
    //   foo.ngrok.io           (no scheme)
    //   voice.example.com
    // Falls back to the request Host header so dev "just works" behind ngrok.
    const publicHost =
      this.config.get<string>('PUBLIC_HOST') ?? hostHeader ?? 'localhost';
    const wsUrl = `wss://${publicHost}/twilio`;

    this.logger.log(`incoming call → streaming to ${wsUrl}`);

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      '  <Connect>',
      `    <Stream url="${wsUrl}" />`,
      '  </Connect>',
      '</Response>',
    ].join('\n');
  }
}
