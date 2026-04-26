import { create } from 'zustand';
import {
  CallState,
  type MetricsTurnPayload,
  type ToolInvokedPayload,
  type Turn,
} from '@voiceforge/shared';

interface CallStore {
  callState: CallState;
  callId: string | null;
  turns: Turn[];
  currentTurnId: string | null;
  error: string | null;
  ttsActive: boolean;

  setCallState: (s: CallState) => void;
  setCallId: (id: string | null) => void;
  setError: (err: string | null) => void;
  setTtsActive: (a: boolean) => void;

  beginUserTurn: (turnId: string, text: string) => void;
  appendAgentDelta: (turnId: string, delta: string) => void;
  finalizeAgentText: (turnId: string, text: string) => void;
  setTurnMetrics: (m: MetricsTurnPayload) => void;
  recordTool: (t: ToolInvokedPayload) => void;
  reset: () => void;
}

export const useCallStore = create<CallStore>((set) => ({
  callState: CallState.Idle,
  callId: null,
  turns: [],
  currentTurnId: null,
  error: null,
  ttsActive: false,

  setCallState: (s) => set({ callState: s }),
  setCallId: (id) => set({ callId: id }),
  setError: (err) => set({ error: err }),
  setTtsActive: (a) => set({ ttsActive: a }),

  beginUserTurn: (turnId, text) =>
    set((state) => {
      if (state.turns.find((t) => t.id === turnId)) {
        return {
          turns: state.turns.map((t) =>
            t.id === turnId ? { ...t, userText: text } : t,
          ),
          currentTurnId: turnId,
        };
      }
      const turn: Turn = {
        id: turnId,
        userText: text,
        agentText: '',
        tools: [],
        startedAt: Date.now(),
      };
      return { turns: [...state.turns, turn], currentTurnId: turnId };
    }),

  appendAgentDelta: (turnId, delta) =>
    set((state) => {
      const exists = state.turns.find((t) => t.id === turnId);
      if (!exists) {
        const turn: Turn = {
          id: turnId,
          userText: '',
          agentText: delta,
          tools: [],
          startedAt: Date.now(),
        };
        return { turns: [...state.turns, turn], currentTurnId: turnId };
      }
      return {
        turns: state.turns.map((t) =>
          t.id === turnId ? { ...t, agentText: t.agentText + delta } : t,
        ),
      };
    }),

  finalizeAgentText: (turnId, text) =>
    set((state) => ({
      turns: state.turns.map((t) =>
        t.id === turnId && text.length > t.agentText.length
          ? { ...t, agentText: text }
          : t,
      ),
    })),

  setTurnMetrics: (m) =>
    set((state) => ({
      turns: state.turns.map((t) =>
        t.id === m.turnId ? { ...t, metrics: m } : t,
      ),
    })),

  recordTool: (tool) =>
    set((state) => ({
      turns: state.turns.map((t) =>
        t.id === tool.turnId ? { ...t, tools: [...t.tools, tool] } : t,
      ),
    })),

  reset: () =>
    set({
      callState: CallState.Idle,
      callId: null,
      turns: [],
      currentTurnId: null,
      error: null,
      ttsActive: false,
    }),
}));
