import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { CallSessionManager } from './call-session.manager';
import { TwilioTransport } from './transport/twilio.transport';

export const TWILIO_WS_PATH = '/twilio';

interface TwilioInbound {
  event: 'connected' | 'start' | 'media' | 'mark' | 'stop' | 'dtmf';
  start?: { streamSid: string; callSid: string };
  media?: { payload: string; track?: string };
  mark?: { name: string };
  streamSid?: string;
}

/**
 * Raw WebSocket gateway for Twilio Media Streams.
 *
 * NestJS' built-in @nestjs/websockets is Socket.IO-only here; Twilio speaks
 * raw `ws`. We expose a `noServer` WSS and let main.ts route HTTP upgrades
 * for the {@link TWILIO_WS_PATH} path to us.
 */
@Injectable()
export class TwilioGateway implements OnModuleDestroy {
  private readonly logger = new Logger(TwilioGateway.name);
  private readonly wss = new WebSocketServer({ noServer: true });

  constructor(private readonly manager: CallSessionManager) {
    this.wss.on('connection', (socket, req) => this.handleConnection(socket, req));
  }

  /** Called by the HTTP server's `upgrade` handler. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }

  onModuleDestroy(): void {
    this.wss.close();
  }

  private handleConnection(socket: WebSocket, req: IncomingMessage): void {
    const remote = req.socket.remoteAddress;
    this.logger.log(`Twilio media stream connected from ${remote}`);

    let transport: TwilioTransport | null = null;

    socket.on('message', async (raw) => {
      let msg: TwilioInbound;
      try {
        msg = JSON.parse(raw.toString()) as TwilioInbound;
      } catch (err) {
        this.logger.warn(`bad JSON from Twilio: ${(err as Error).message}`);
        return;
      }

      switch (msg.event) {
        case 'connected':
          // Initial handshake — Twilio sends `protocol` + `version`. Nothing to do.
          break;

        case 'start': {
          if (!msg.start) return;
          const { streamSid, callSid } = msg.start;
          transport = new TwilioTransport(socket, streamSid, callSid);
          try {
            await this.manager.startCall(transport);
          } catch (err) {
            this.logger.error(
              `failed to start call ${callSid}: ${(err as Error).message}`,
            );
            await transport.end('start_failed').catch(() => undefined);
            transport = null;
          }
          break;
        }

        case 'media': {
          if (!transport || !msg.media?.payload) return;
          // Twilio sends inbound caller audio on the 'inbound' track by default.
          // Outbound track echo can be ignored; here we accept any track.
          const mulaw = Buffer.from(msg.media.payload, 'base64');
          transport.feedMulaw(mulaw);
          break;
        }

        case 'mark':
          // Playback completion marker (we'd send these with `mark` events to track
          // when our outbound audio finished playing). Phase E.
          break;

        case 'stop':
          if (transport) {
            await transport.end('twilio_stop').catch(() => undefined);
            transport = null;
          }
          break;

        case 'dtmf':
          // Phase E: keypad digits during the call.
          break;
      }
    });

    socket.on('close', async () => {
      this.logger.log('Twilio media stream closed');
      if (transport) {
        await transport.end('socket_close').catch(() => undefined);
        transport = null;
      }
    });

    socket.on('error', (err) => {
      this.logger.warn(`Twilio socket error: ${err.message}`);
    });
  }
}
