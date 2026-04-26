import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallState } from '@voiceforge/shared';
import { CallButton } from './CallButton';

describe('CallButton', () => {
  const onStart = vi.fn();
  const onEnd = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Start Call" in Idle state', () => {
    render(<CallButton state={CallState.Idle} onStart={onStart} onEnd={onEnd} />);
    expect(screen.getByText('Start Call')).toBeInTheDocument();
  });

  it('shows "End Call" when Listening', () => {
    render(<CallButton state={CallState.Listening} onStart={onStart} onEnd={onEnd} />);
    expect(screen.getByText('End Call')).toBeInTheDocument();
  });

  it('shows "End Call" when Speaking', () => {
    render(<CallButton state={CallState.Speaking} onStart={onStart} onEnd={onEnd} />);
    expect(screen.getByText('End Call')).toBeInTheDocument();
  });

  it('shows "Thinking…" when Thinking', () => {
    render(<CallButton state={CallState.Thinking} onStart={onStart} onEnd={onEnd} />);
    expect(screen.getByText('Thinking…')).toBeInTheDocument();
  });

  it('shows "Start New Call" when Ended', () => {
    render(<CallButton state={CallState.Ended} onStart={onStart} onEnd={onEnd} />);
    expect(screen.getByText('Start New Call')).toBeInTheDocument();
  });

  it('calls onStart when clicking Start Call in Idle state', async () => {
    const user = userEvent.setup();
    render(<CallButton state={CallState.Idle} onStart={onStart} onEnd={onEnd} />);

    await user.click(screen.getByText('Start Call'));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('calls onEnd when clicking End Call in Listening state', async () => {
    const user = userEvent.setup();
    render(<CallButton state={CallState.Listening} onStart={onStart} onEnd={onEnd} />);

    await user.click(screen.getByText('End Call'));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('calls onEnd when clicking End Call in Speaking state', async () => {
    const user = userEvent.setup();
    render(<CallButton state={CallState.Speaking} onStart={onStart} onEnd={onEnd} />);

    await user.click(screen.getByText('End Call'));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('is disabled when Connecting', () => {
    render(<CallButton state={CallState.Connecting} onStart={onStart} onEnd={onEnd} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
  });

  it('does not call onStart or onEnd when Connecting (disabled)', async () => {
    const user = userEvent.setup();
    render(<CallButton state={CallState.Connecting} onStart={onStart} onEnd={onEnd} />);

    await user.click(screen.getByRole('button'));
    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('calls onStart when clicking in Ended state', async () => {
    const user = userEvent.setup();
    render(<CallButton state={CallState.Ended} onStart={onStart} onEnd={onEnd} />);

    await user.click(screen.getByText('Start New Call'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('has correct aria-label for each state', () => {
    const { rerender } = render(
      <CallButton state={CallState.Idle} onStart={onStart} onEnd={onEnd} />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Start Call');

    rerender(
      <CallButton state={CallState.Listening} onStart={onStart} onEnd={onEnd} />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'End Call');
  });
});
