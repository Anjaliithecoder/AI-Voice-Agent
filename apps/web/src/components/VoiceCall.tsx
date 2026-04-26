import { CallState } from '@voiceforge/shared';
import { Card } from '@/components/ui/card';
import { useVoiceCall } from '@/hooks/useVoiceCall';
import { useCallStore } from '@/store/callStore';
import { CallButton } from './CallButton';
import { TranscriptView } from './TranscriptView';
import { MetricsPanel } from './MetricsPanel';
import { AudioWaveform } from './AudioWaveform';
import { cn } from '@/lib/utils';

const STATUS_TEXT: Record<CallState, string> = {
  [CallState.Idle]: 'Ready when you are.',
  [CallState.Connecting]: 'Connecting to Arya…',
  [CallState.Listening]: 'Listening — go ahead.',
  [CallState.Thinking]: 'Thinking…',
  [CallState.Speaking]: 'Arya is speaking…',
  [CallState.Ended]: 'Call ended.',
};

export function VoiceCall() {
  const callState = useCallStore((s) => s.callState);
  const turns = useCallStore((s) => s.turns);
  const error = useCallStore((s) => s.error);
  const { startCall, endCall, micLevel, reconnecting } = useVoiceCall();

  const isAgentSpeaking = callState === CallState.Speaking;
  const isUserSpeaking = callState === CallState.Listening && micLevel > 0.025;

  const statusText = reconnecting
    ? 'Reconnecting…'
    : STATUS_TEXT[callState];

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden" aria-label="Voice call controls">
        <div className="px-8 py-10 flex flex-col items-center gap-6 bg-gradient-to-b from-primary/5 to-transparent">
          <div className={cn(
            'h-16 w-full max-w-md transition-opacity',
            (isAgentSpeaking || isUserSpeaking) ? 'opacity-100' : 'opacity-30',
          )}>
            <AudioWaveform
              level={micLevel}
              active={isAgentSpeaking || isUserSpeaking}
              color={isAgentSpeaking
                ? 'rgb(37, 99, 235)' // blue-600
                : 'rgb(22, 163, 74)' // green-600
              }
            />
          </div>
          <div
            className="text-sm text-muted-foreground h-5"
            role="status"
            aria-live="polite"
          >
            {error ? (
              <span className="text-red-500">{error}</span>
            ) : (
              statusText
            )}
          </div>
          <CallButton state={callState} onStart={startCall} onEnd={endCall} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
        <Card className="h-[400px] flex flex-col" aria-label="Live transcript">
          <div className="px-6 py-3 border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
            Live Transcript
          </div>
          <div className="flex-1 overflow-hidden">
            <TranscriptView turns={turns} callState={callState} />
          </div>
        </Card>

        <Card className="h-[400px] overflow-y-auto" aria-label="Call metrics">
          <div className="px-6 py-3 border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
            Metrics
          </div>
          <MetricsPanel turns={turns} />
        </Card>
      </div>
    </div>
  );
}
