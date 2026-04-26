import { describe, it, expect, beforeEach } from 'vitest';
import { CallState } from '@voiceforge/shared';
import type { MetricsTurnPayload, ToolInvokedPayload } from '@voiceforge/shared';
import { useCallStore } from './callStore';

describe('callStore', () => {
  beforeEach(() => {
    // Use the store's own reset action, then clear any residual fields.
    // Avoid setState(…, true) which replaces the entire store including actions.
    useCallStore.getState().reset();
  });

  it('has correct initial state', () => {
    const state = useCallStore.getState();
    expect(state.callState).toBe(CallState.Idle);
    expect(state.turns).toEqual([]);
    expect(state.callId).toBeNull();
    expect(state.currentTurnId).toBeNull();
    expect(state.error).toBeNull();
    expect(state.ttsActive).toBe(false);
  });

  describe('setCallState', () => {
    it('updates the call state', () => {
      useCallStore.getState().setCallState(CallState.Connecting);
      expect(useCallStore.getState().callState).toBe(CallState.Connecting);
    });

    it('can transition through multiple states', () => {
      const { setCallState } = useCallStore.getState();
      setCallState(CallState.Connecting);
      setCallState(CallState.Listening);
      setCallState(CallState.Thinking);
      expect(useCallStore.getState().callState).toBe(CallState.Thinking);
    });
  });

  describe('beginUserTurn', () => {
    it('creates a new turn with user text', () => {
      useCallStore.getState().beginUserTurn('turn-1', 'Hello there');

      const state = useCallStore.getState();
      expect(state.turns).toHaveLength(1);
      expect(state.turns[0]).toMatchObject({
        id: 'turn-1',
        userText: 'Hello there',
        agentText: '',
        tools: [],
      });
      expect(state.turns[0].startedAt).toBeGreaterThan(0);
      expect(state.currentTurnId).toBe('turn-1');
    });

    it('updates existing turn text if turn already exists', () => {
      useCallStore.getState().beginUserTurn('turn-1', 'Hello');
      useCallStore.getState().beginUserTurn('turn-1', 'Hello there');

      const state = useCallStore.getState();
      expect(state.turns).toHaveLength(1);
      expect(state.turns[0].userText).toBe('Hello there');
      expect(state.currentTurnId).toBe('turn-1');
    });
  });

  describe('appendAgentDelta', () => {
    it('appends text to an existing turn', () => {
      useCallStore.getState().beginUserTurn('turn-1', 'Hi');
      useCallStore.getState().appendAgentDelta('turn-1', 'Hello');
      useCallStore.getState().appendAgentDelta('turn-1', ' world');

      const state = useCallStore.getState();
      expect(state.turns[0].agentText).toBe('Hello world');
    });

    it('creates a new turn if the turn does not exist', () => {
      useCallStore.getState().appendAgentDelta('turn-new', 'Surprise');

      const state = useCallStore.getState();
      expect(state.turns).toHaveLength(1);
      expect(state.turns[0]).toMatchObject({
        id: 'turn-new',
        userText: '',
        agentText: 'Surprise',
        tools: [],
      });
      expect(state.currentTurnId).toBe('turn-new');
    });
  });

  describe('finalizeAgentText', () => {
    it('updates agent text when new text is longer', () => {
      useCallStore.getState().beginUserTurn('turn-1', 'Hi');
      useCallStore.getState().appendAgentDelta('turn-1', 'Short');
      useCallStore.getState().finalizeAgentText('turn-1', 'This is a longer final text');

      expect(useCallStore.getState().turns[0].agentText).toBe(
        'This is a longer final text',
      );
    });

    it('does not update if new text is shorter or equal', () => {
      useCallStore.getState().beginUserTurn('turn-1', 'Hi');
      useCallStore.getState().appendAgentDelta('turn-1', 'Already long enough text');
      useCallStore.getState().finalizeAgentText('turn-1', 'Short');

      expect(useCallStore.getState().turns[0].agentText).toBe(
        'Already long enough text',
      );
    });
  });

  describe('setTurnMetrics', () => {
    it('adds metrics to the correct turn', () => {
      useCallStore.getState().beginUserTurn('turn-1', 'Hi');
      useCallStore.getState().beginUserTurn('turn-2', 'Hello');

      const metrics: MetricsTurnPayload = {
        turnId: 'turn-1',
        sttMs: 100,
        llmMs: 200,
        ttsMs: 150,
        totalMs: 450,
      };

      useCallStore.getState().setTurnMetrics(metrics);

      const state = useCallStore.getState();
      expect(state.turns[0].metrics).toEqual(metrics);
      expect(state.turns[1].metrics).toBeUndefined();
    });
  });

  describe('recordTool', () => {
    it('adds a tool invocation to the correct turn', () => {
      useCallStore.getState().beginUserTurn('turn-1', 'Check weather');

      const tool: ToolInvokedPayload = {
        turnId: 'turn-1',
        name: 'get_weather',
        args: { city: 'NYC' },
        result: { temp: 72 },
      };

      useCallStore.getState().recordTool(tool);

      const state = useCallStore.getState();
      expect(state.turns[0].tools).toHaveLength(1);
      expect(state.turns[0].tools[0]).toEqual(tool);
    });

    it('does not add tools to unrelated turns', () => {
      useCallStore.getState().beginUserTurn('turn-1', 'First');
      useCallStore.getState().beginUserTurn('turn-2', 'Second');

      const tool: ToolInvokedPayload = {
        turnId: 'turn-2',
        name: 'search',
        args: { q: 'test' },
      };

      useCallStore.getState().recordTool(tool);

      expect(useCallStore.getState().turns[0].tools).toHaveLength(0);
      expect(useCallStore.getState().turns[1].tools).toHaveLength(1);
    });
  });

  describe('reset', () => {
    it('clears everything back to initial state', () => {
      // Set up some state
      useCallStore.getState().setCallState(CallState.Speaking);
      useCallStore.getState().setCallId('call-abc');
      useCallStore.getState().setError('something broke');
      useCallStore.getState().setTtsActive(true);
      useCallStore.getState().beginUserTurn('turn-1', 'Hi');

      // Verify state was changed
      expect(useCallStore.getState().callState).toBe(CallState.Speaking);
      expect(useCallStore.getState().turns).toHaveLength(1);

      // Reset
      useCallStore.getState().reset();

      const state = useCallStore.getState();
      expect(state.callState).toBe(CallState.Idle);
      expect(state.callId).toBeNull();
      expect(state.turns).toEqual([]);
      expect(state.currentTurnId).toBeNull();
      expect(state.error).toBeNull();
      expect(state.ttsActive).toBe(false);
    });
  });
});
