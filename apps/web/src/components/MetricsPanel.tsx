import { Activity, Wrench, Check, AlertTriangle, AlertCircle } from 'lucide-react';
import type { Turn } from '@voiceforge/shared';
import { cn } from '@/lib/utils';

interface MetricsPanelProps {
  turns: Turn[];
}

export function MetricsPanel({ turns }: MetricsPanelProps) {
  const lastWithMetrics = [...turns]
    .reverse()
    .find((t) => t.metrics !== undefined);
  const m = lastWithMetrics?.metrics;
  const tools = lastWithMetrics?.tools ?? [];

  const totalColor = !m
    ? 'text-muted-foreground'
    : m.totalMs < 800
      ? 'text-green-500'
      : m.totalMs < 1200
        ? 'text-amber-500'
        : 'text-red-500';
  const totalIcon = !m ? null : m.totalMs < 800 ? (
    <Check className="h-4 w-4" />
  ) : m.totalMs < 1200 ? (
    <AlertTriangle className="h-4 w-4" />
  ) : (
    <AlertCircle className="h-4 w-4" />
  );

  return (
    <div className="p-6 space-y-6 text-sm">
      <section>
        <header className="flex items-center gap-2 text-muted-foreground mb-3">
          <Activity className="h-4 w-4" />
          <span className="uppercase tracking-wider text-[11px]">
            Last turn latency
          </span>
        </header>
        {!m ? (
          <div className="text-muted-foreground italic">
            No turns yet — start a call.
          </div>
        ) : (
          <ul className="space-y-1.5">
            <Row label="STT" value={`${m.sttMs} ms`} />
            <Row label="LLM" value={`${m.llmMs} ms`} />
            <Row label="TTS" value={`${m.ttsMs} ms`} />
            <li
              className={cn(
                'flex items-center justify-between pt-2 mt-2 border-t border-border/60 font-medium',
                totalColor,
              )}
            >
              <span className="flex items-center gap-2">
                {totalIcon}
                Total
              </span>
              <span className="tabular-nums">{m.totalMs} ms</span>
            </li>
          </ul>
        )}
      </section>

      <section>
        <header className="flex items-center gap-2 text-muted-foreground mb-3">
          <Wrench className="h-4 w-4" />
          <span className="uppercase tracking-wider text-[11px]">
            Tools called this turn
          </span>
        </header>
        {tools.length === 0 ? (
          <div className="text-muted-foreground italic">None</div>
        ) : (
          <ul className="space-y-2">
            {tools.map((t, i) => (
              <li
                key={`${t.name}-${i}`}
                className="rounded-md bg-secondary/60 px-3 py-2"
              >
                <div className="font-mono text-xs font-medium">{t.name}</div>
                <div className="font-mono text-[11px] text-muted-foreground mt-1 break-all">
                  {JSON.stringify(t.args)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <header className="flex items-center gap-2 text-muted-foreground mb-3">
          <span className="uppercase tracking-wider text-[11px]">
            Try saying
          </span>
        </header>
        <ul className="space-y-1 text-muted-foreground text-xs">
          <li>"Hi, my number is plus nine one nine eight seven six five four three two one zero."</li>
          <li>"Can you check my recent tickets?"</li>
          <li>"What's the status of order ORD-5521?"</li>
        </ul>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </li>
  );
}
