import { useEffect, useRef } from 'react';
import { CallState, type Turn } from '@voiceforge/shared';
import { cn } from '@/lib/utils';

interface TranscriptViewProps {
  turns: Turn[];
  callState: CallState;
}

export function TranscriptView({ turns, callState }: TranscriptViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns, callState]);

  const isThinking = callState === CallState.Thinking;

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto p-6 space-y-4 text-sm"
    >
      {turns.length === 0 ? (
        <div className="text-muted-foreground italic text-center pt-12">
          The conversation will appear here.
        </div>
      ) : (
        turns.map((turn) => (
          <div key={turn.id} className="space-y-3">
            {turn.userText && (
              <Bubble speaker="You" text={turn.userText} variant="user" />
            )}
            {turn.agentText && (
              <Bubble
                speaker="Arya"
                text={turn.agentText}
                variant="agent"
              />
            )}
          </div>
        ))
      )}
      {isThinking && (
        <Bubble speaker="Arya" variant="agent" text={null} typing />
      )}
    </div>
  );
}

function Bubble({
  speaker,
  text,
  variant,
  typing,
}: {
  speaker: string;
  text: string | null;
  variant: 'user' | 'agent';
  typing?: boolean;
}) {
  const isUser = variant === 'user';
  return (
    <div
      className={cn(
        'flex flex-col gap-1',
        isUser ? 'items-end' : 'items-start',
      )}
    >
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {speaker}
      </span>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-secondary text-secondary-foreground rounded-tl-sm',
        )}
      >
        {typing ? <TypingDots /> : text}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-bounce" />
    </span>
  );
}
