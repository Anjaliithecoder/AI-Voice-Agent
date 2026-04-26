import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { EVENTS } from '@voiceforge/shared';
import { CallSessionManager } from './call-session.manager';
import { BrowserTransport } from './transport/browser.transport';

@WebSocketGateway({
  path: '/voice',
  cors: {
    origin: true,
    credentials: true,
  },
  // Allow large binary frames (audio chunks).
  maxHttpBufferSize: 1e7,
})
export class VoiceGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(VoiceGateway.name);

  /** socket.id → transport (one transport per browser connection). */
  private readonly transports = new Map<string, BrowserTransport>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly manager: CallSessionManager,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Server): void {
    const corsOrigin = this.config.get<string>('CORS_ORIGIN') ?? '*';
    server.engine.opts.cors = { origin: corsOrigin, credentials: true };
    this.logger.log(`Voice gateway ready on /voice (CORS: ${corsOrigin})`);
  }

  handleConnection(@ConnectedSocket() socket: Socket): void {
    this.logger.log(`socket connected: ${socket.id}`);
  }

  async handleDisconnect(@ConnectedSocket() socket: Socket): Promise<void> {
    this.logger.log(`socket disconnected: ${socket.id}`);
    const transport = this.transports.get(socket.id);
    if (!transport) return;
    this.transports.delete(socket.id);
    await this.manager.endCall(transport.callId, 'disconnect');
  }

  @SubscribeMessage(EVENTS.CALL_START)
  async onCallStart(
    @ConnectedSocket() socket: Socket,
    @MessageBody() _payload: unknown,
  ): Promise<void> {
    void _payload;
    try {
      // Replace any prior transport for this socket.
      const prior = this.transports.get(socket.id);
      if (prior) {
        await this.manager.endCall(prior.callId, 'replaced');
        this.transports.delete(socket.id);
      }

      const transport = new BrowserTransport(socket);
      this.transports.set(socket.id, transport);
      await this.manager.startCall(transport);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`call start failed: ${msg}`);
      socket.emit(EVENTS.ERROR, {
        code: 'UNKNOWN',
        message: msg,
        recoverable: false,
      });
    }
  }

  @SubscribeMessage(EVENTS.AUDIO_CHUNK)
  onAudioChunk(
    @ConnectedSocket() socket: Socket,
    @MessageBody() chunk: ArrayBuffer | Buffer,
  ): void {
    const transport = this.transports.get(socket.id);
    if (!transport) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    transport.feedAudio(buf);
  }

  @SubscribeMessage(EVENTS.USER_BARGE_IN)
  onBargeIn(@ConnectedSocket() socket: Socket): void {
    this.transports.get(socket.id)?.signalBargeIn();
  }

  @SubscribeMessage(EVENTS.CALL_END)
  async onCallEnd(@ConnectedSocket() socket: Socket): Promise<void> {
    const transport = this.transports.get(socket.id);
    if (!transport) return;
    this.transports.delete(socket.id);
    await this.manager.endCall(transport.callId, 'user_ended');
  }
}
