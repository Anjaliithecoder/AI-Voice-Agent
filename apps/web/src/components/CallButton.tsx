import { Mic, MicOff, Loader2, PhoneOff } from 'lucide-react';
import { CallState } from '@voiceforge/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CallButtonProps {
  state: CallState;
  onStart: () => void;
  onEnd: () => void;
}

const LABELS: Record<CallState, string> = {
  [CallState.Idle]: 'Start Call',
  [CallState.Connecting]: 'Connecting…',
  [CallState.Listening]: 'End Call',
  [CallState.Thinking]: 'Thinking…',
  [CallState.Speaking]: 'End Call',
  [CallState.Ended]: 'Start New Call',
};

const RING_CLASS: Record<CallState, string> = {
  [CallState.Idle]: 'bg-primary text-primary-foreground hover:bg-primary/90',
  [CallState.Connecting]:
    'bg-primary/80 text-primary-foreground animate-pulse',
  [CallState.Listening]:
    'bg-green-600 text-white hover:bg-green-700 ring-4 ring-green-500/30',
  [CallState.Thinking]:
    'bg-amber-500 text-white animate-pulse ring-4 ring-amber-500/30',
  [CallState.Speaking]:
    'bg-blue-600 text-white ring-4 ring-blue-500/30',
  [CallState.Ended]: 'bg-primary text-primary-foreground hover:bg-primary/90',
};

export function CallButton({ state, onStart, onEnd }: CallButtonProps) {
  const isActive =
    state === CallState.Listening ||
    state === CallState.Thinking ||
    state === CallState.Speaking;
  const isConnecting = state === CallState.Connecting;

  const handle = () => {
    if (isConnecting) return;
    if (isActive) onEnd();
    else onStart();
  };

  const icon = isConnecting ? (
    <Loader2 className="h-6 w-6 animate-spin" />
  ) : isActive ? (
    <PhoneOff className="h-6 w-6" />
  ) : state === CallState.Ended ? (
    <Mic className="h-6 w-6" />
  ) : (
    <Mic className="h-6 w-6" />
  );

  return (
    <Button
      size="xl"
      onClick={handle}
      disabled={isConnecting}
      className={cn(
        'min-w-[14rem] gap-3 transition-all duration-300 shadow-lg',
        RING_CLASS[state],
      )}
      aria-label={LABELS[state]}
    >
      {icon}
      {LABELS[state]}
    </Button>
  );
}

// Small helper used elsewhere:
export function MutedIcon({ className }: { className?: string }) {
  return <MicOff className={className} />;
}
