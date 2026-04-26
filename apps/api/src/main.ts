import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { AppModule } from './app.module';
import { TwilioGateway, TWILIO_WS_PATH } from './voice/twilio.gateway';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    bodyParser: true,
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:5173');

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useWebSocketAdapter(new IoAdapter(app));

  app.enableShutdownHooks();

  await app.listen(port);

  // Route raw-WebSocket upgrades for /twilio to TwilioGateway. Socket.IO continues
  // to handle its own upgrades for /voice (its handler ignores other paths).
  const httpServer = app.getHttpServer() as HttpServer;
  const twilioGateway = app.get(TwilioGateway);
  httpServer.on(
    'upgrade',
    (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = req.url ?? '';
      // Strip query string before path comparison.
      const path = url.split('?', 1)[0];
      if (path === TWILIO_WS_PATH) {
        twilioGateway.handleUpgrade(req, socket, head);
      }
      // Other paths: Socket.IO's own upgrade listener handles them.
    },
  );

  const logger = new Logger('Bootstrap');
  logger.log(`VoiceForge API listening on http://localhost:${port}`);
  logger.log(`CORS origin: ${corsOrigin}`);
  logger.log(`Twilio Media Streams ready on ws://localhost:${port}${TWILIO_WS_PATH}`);
  logger.log(`TwiML endpoint: POST http://localhost:${port}/twilio/twiml`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[fatal] failed to bootstrap', err);
  process.exit(1);
});
