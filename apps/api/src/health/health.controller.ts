import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';

interface HealthStatus {
  readonly status: string;
  readonly uptime: number;
  readonly timestamp: string;
  readonly version: string;
}

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    };
  }

  @Get('ready')
  @HealthCheck()
  async readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () =>
        Promise.resolve({
          app: { status: 'up' as const },
        }),
    ]);
  }
}
