import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallState } from '@voiceforge/shared';
import type { Turn } from '@voiceforge/shared';
import { VoiceCall } from './VoiceCall';

// Mock useVoiceCall hook
const mockStartCall = vi.fn();
const mockEndCall = vi.fn();
vi.mock('@/hooks/useVoiceCall', () => ({
  useVoiceCall: () => ({
    startCall: mockStartCall,
    endCall: mockEndCall,
    micLevel: 0,
  }),
}));

// Mock child components that are complex or have their own tests
vi.mock('./TranscriptView', () => ({
  TranscriptView: ({ turns }: { turns: Turn[] }) => (
    <div data-testid="transcript-view">
      {turns.map((t) => (
        <div key={t.id}>{t.userText}</div>
      ))}
    </div>
  ),
}));

vi.mock('./MetricsPanel', () => ({
  MetricsPanel: ({ turns }: { turns: Turn[] }) => (
    <div data-testid="metrics-panel">{turns.length} turns</div>
  ),
}));

vi.mock('./AudioWaveform', () => ({
  AudioWaveform: () => <div data-testid="audio-waveform" />,
}));

// Store mock state
let mockCallState: CallState = CallState.Idle;
let mockTurns: Turn[] = [];
let mockError: string | null = null;

vi.mock('@/store/callStore', () => ({
  useCallStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      callState: mockCallState,
      turns: mockTurns,
      error: mockError,
    }),
}));

describe('VoiceCall', () => {
  beforeEach(() => {
    mockCallState = CallState.Idle;
    mockTurns = [];
    mockError = null;
    vi.clearAllMocks();
  });

  it('renders "Ready when you are." in Idle state', () => {
    render(<VoiceCall />);
    expect(screen.getByText('Ready when you are.')).toBeInTheDocument();
  });

  it('renders "Connecting to Arya…" when Connecting', () => {
    mockCallState = CallState.Connecting;
    render(<VoiceCall />);
    expect(screen.getByText('Connecting to Arya…')).toBeInTheDocument();
  });

  it('shows error message when error is set', () => {
    mockError = 'Mic permission denied';
    render(<VoiceCall />);
    expect(screen.getByText('Mic permission denied')).toBeInTheDocument();
  });

  it('renders the transcript section', () => {
    mockTurns = [
      {
        id: 'turn-1',
        userText: 'Hello',
        agentText: 'Hi there',
        tools: [],
        startedAt: Date.now(),
      },
    ];
    render(<VoiceCall />);
    expect(screen.getByTestId('transcript-view')).toBeInTheDocument();
    expect(screen.getByText('Live Transcript')).toBeInTheDocument();
  });

  it('renders the metrics section', () => {
    render(<VoiceCall />);
    expect(screen.getByTestId('metrics-panel')).toBeInTheDocument();
    expect(screen.getByText('Metrics')).toBeInTheDocument();
  });

  it('renders the audio waveform', () => {
    render(<VoiceCall />);
    expect(screen.getByTestId('audio-waveform')).toBeInTheDocument();
  });

  it('passes turns to TranscriptView and MetricsPanel', () => {
    mockTurns = [
      {
        id: 'turn-1',
        userText: 'What is AI?',
        agentText: 'AI is...',
        tools: [],
        startedAt: Date.now(),
      },
      {
        id: 'turn-2',
        userText: 'Tell me more',
        agentText: 'Sure...',
        tools: [],
        startedAt: Date.now(),
      },
    ];
    render(<VoiceCall />);
    expect(screen.getByText('What is AI?')).toBeInTheDocument();
    expect(screen.getByText('Tell me more')).toBeInTheDocument();
    expect(screen.getByText('2 turns')).toBeInTheDocument();
  });

  it('displays different status text for each call state', () => {
    const stateTexts: Array<[CallState, string]> = [
      [CallState.Listening, 'Listening — go ahead.'],
      [CallState.Thinking, 'Thinking…'],
      [CallState.Speaking, 'Arya is speaking…'],
      [CallState.Ended, 'Call ended.'],
    ];

    for (const [state, text] of stateTexts) {
      mockCallState = state;
      const { unmount } = render(<VoiceCall />);
      // Use getAllByText because some status strings also appear in the CallButton label.
      // Verify at least one element with the status text exists.
      const matches = screen.getAllByText(text);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      unmount();
    }
  });
});
