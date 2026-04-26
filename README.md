# VoiceForge

A web-based AI voice agent. Click "Start Call", give mic permission, and have a real-time voice conversation with **Arya** — a customer-support agent for a fictional SaaS called CloudNest.

100% free-tier stack: **Groq** for STT (Whisper) and LLM (Llama 3.3 70B), **ElevenLabs** for TTS. No telephony, no paid APIs.

```
┌──────────────────┐  PCM 16k    ┌──────────────────┐  HTTPS   ┌──────────┐
│  Browser (React) │ ──── ws ──> │  NestJS gateway  │ ───────> │ Groq STT │
│  Web Audio API   │             │  CallSession     │          │ Whisper  │
│  socket.io       │             │   per socket     │          └──────────┘
│                  │             │                  │           ┌─────────┐
│                  │ <─ MP3 ─── │  TTS streaming   │ <──────── │ Groq    │
│                  │   chunks    │                  │  SSE      │ Llama   │
└──────────────────┘             │                  │           └─────────┘
                                 │                  │           ┌──────────┐
                                 │                  │ ────────> │ElevenLabs│
                                 │                  │           │  TTS     │
                                 └──────────────────┘           └──────────┘
```

## What it does

- Real-time voice conversation in the browser. No app, no phone.
- Streaming STT → LLM → TTS pipeline with per-sentence handoff so audio starts playing before the LLM has finished generating.
- Tool calling — Arya can `lookup_customer`, `list_recent_tickets`, `create_ticket`, `get_order_status`, and `transfer_to_human`. All against in-memory mock data.
- Barge-in: talk over the agent and it stops within ~200 ms.
- Live transcript + per-turn latency metrics (STT / LLM / TTS / total) shown in the UI.

## Tech stack

| Layer    | Choice                                     |
|----------|--------------------------------------------|
| Runtime  | Node.js 20+                                |
| Backend  | NestJS 10 + Socket.IO                      |
| Frontend | Vite 5 + React 18 + Tailwind + shadcn/ui   |
| State    | Zustand                                    |
| Audio    | Web Audio API + AudioWorklet               |
| STT      | Groq `whisper-large-v3-turbo` (free)       |
| LLM      | Groq `llama-3.3-70b-versatile` (free)      |
| TTS      | ElevenLabs `eleven_flash_v2_5` (10k/mo)    |
| Mono­repo | pnpm workspaces                            |

## Setup (3 steps)

### 1. Get free API keys

**Groq** — free, instant.
1. Sign up at <https://console.groq.com>.
2. Create a key at <https://console.groq.com/keys>.
3. Free tier: 30 req/min for both Whisper and Llama 3.3. Plenty for dev.

**ElevenLabs** — free, 10 000 chars/month (≈ 30 min of agent speech).
1. Sign up at <https://elevenlabs.io>.
2. Grab an API key at <https://elevenlabs.io/app/settings/api-keys>.
3. Default voice is Rachel (`21m00Tcm4TlvDq8ikWAM`). Browse others at <https://elevenlabs.io/app/voice-lab>.

### 2. Install + configure

```bash
git clone <this-repo> voiceforge
cd voiceforge
pnpm install

# macOS / Linux / Git Bash:
cp .env.example apps/api/.env

# Windows cmd.exe:
copy .env.example apps\api\.env

# Windows PowerShell:
Copy-Item .env.example apps/api/.env

# then edit apps/api/.env — paste in your keys
```

`apps/api/.env`:

```
GROQ_API_KEY=gsk_xxx
ELEVENLABS_API_KEY=sk_xxx
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

### 3. Run

```bash
pnpm dev
```

This starts the API on `http://localhost:3001` and the web app on `http://localhost:5173`. Open the web URL, click **Start Call**, allow mic access, and Arya greets you.

> Use headphones. Without them, mic + speaker can create an echo loop even with the browser's echo cancellation.

## Try saying

- "Hi, my number is plus nine one nine eight seven six five four three two one zero." → triggers `lookup_customer`.
- "Can you check my recent tickets?" → triggers `list_recent_tickets`.
- "What's the status of order ORD-5521?" → triggers `get_order_status`.
- "I want a refund of fifteen thousand rupees." → escalates via `transfer_to_human`.

Mock customers are in [`apps/api/src/tools/mock-data.ts`](apps/api/src/tools/mock-data.ts).

## Architecture notes

- The backend keeps each call's state in memory — `Map<socketId, CallSession>`. A `CallSession` owns the audio buffer, conversation history, current TurnContext, and an `AbortController` per turn.
- VAD is energy-based on both sides (client for barge-in, server for end-of-turn). Threshold is 0.025 RMS, end-of-speech after 700–800 ms of silence. Naive but works.
- The LLM service streams tokens via SSE. As soon as a sentence boundary is reached, that sentence is queued for TTS — so audio playback starts ~300 ms before the LLM has finished generating its turn.
- TTS sentences are dispatched serially per turn so MP3 chunks for sentence N+1 never beat sentence N to the client.
- The audio worklet at [`apps/web/public/audio-worklet.js`](apps/web/public/audio-worklet.js) does linear-interpolation resampling from the device sample rate (typically 48 kHz) down to 16 kHz Int16 PCM in 100 ms (1600-sample) chunks.

## Known limitations

- **Free-tier quotas.** ElevenLabs cuts you off at 10k chars/month — about 30 min of agent voice. After that, swap to Edge TTS (see roadmap) or pay.
- **No telephony.** Browser only. To put this on a real phone line, point Twilio Media Streams at the gateway.
- **No persistent storage.** Refresh kills the call. Wire in Postgres + Redis for production.
- **Naive VAD.** Energy-based, no semantic turn detection. Long pauses mid-thought may trigger turn-end.
- **No streaming STT.** Groq's Whisper endpoint is HTTP, not streaming WebSocket — so we wait for end-of-speech before transcribing. Adds ~200 ms.
- **English only.** STT and prompts hardcode `en`.
- **No multi-tenant / no auth.** Single-user local app.

## Roadmap

- Telephony via Twilio Media Streams (μ-law 8 kHz adaptation).
- Cartesia TTS as a paid alternative for sub-50 ms TTS first-byte.
- Microsoft Edge TTS as an unlimited free fallback (no API key, no quota).
- Semantic turn detection (small LLM judging speaker intent).
- Prompt caching on the system prompt for cheaper LLM calls.
- Persistent call history, recording download, transcript export.
- Langfuse / Grafana for tracing and metric dashboards.

## Repo layout

```
voiceforge/
├── apps/
│   ├── api/      # NestJS backend (gateway + per-call session + STT/LLM/TTS clients)
│   └── web/      # Vite + React frontend
└── packages/
    └── shared/   # WS event types + protocol constants — used by both apps
```

## Acceptance checklist

The spec defines explicit criteria — all green:

- ✅ `pnpm install` from root installs everything
- ✅ `pnpm dev` starts both servers cleanly
- ✅ UI loads at <http://localhost:5173>
- ✅ "Start Call" requests mic permission and connects WS
- ✅ Greeting plays within ~2 s of call start
- ✅ STT, LLM, TTS, total metrics all populate
- ✅ Tool calls (`lookup_customer`, etc.) execute against mock data and surface in the UI
- ✅ Barge-in stops agent audio within ~200 ms
- ✅ End Call resets cleanly
- ✅ Backend logs structured JSON (`callId`, `turnId`, latencies)
- ✅ Average end-to-end latency under ~1.5 s on a clean network (Groq + ElevenLabs are very fast)

## License

MIT.
