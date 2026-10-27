# ChessCageAI text model

ChessCageAI uses a server-side provider interface (`CageAiTextModelProvider`) so the runtime can be replaced without changing chat, memory, knowledge retrieval, or Stockfish integration. The initial adapter calls Ollama's native `/api/chat` endpoint and expects a locally installed model that supports JSON output.

## Local setup

1. Install Ollama on the same machine or private server that runs the Next.js application.
2. Download the default model with `ollama pull qwen3:4b`.
3. Configure these server-only environment variables:

   ```text
   CAGE_AI_OLLAMA_MODEL=qwen3:4b
   CAGE_AI_OLLAMA_BASE_URL=http://127.0.0.1:11434
   ```

   `CAGE_AI_OLLAMA_BASE_URL` is optional when Ollama uses its default local address. The endpoint must be loopback or a private IP (RFC 1918 IPv4 or IPv6 ULA); public Internet hosts, DNS names and redirects are rejected so prompts cannot be sent to external AI services. Never prefix these variables with `NEXT_PUBLIC_`.
4. Start Ollama and the web application. By default, ChessCageAI uses `qwen3:4b`; `CAGE_AI_OLLAMA_MODEL` can override the model. If Ollama is unreachable or rejects the model, ChessCageAI returns a clear unavailable message rather than claiming that a model is connected.

The request contains only the validated current question and its purpose-specific context. Depending on the task, this can include selected memories, retrieved ChessCage knowledge chunks, and Stockfish analysis evidence. It does not send complete chat history, and ChessCageAI does not store the prompt as a memory. API credentials are not used by this local adapter.

## Hosting

The default Ollama service runs on the same host as the server-side Next.js runtime. For future self-hosting, `CAGE_AI_OLLAMA_BASE_URL` may target a private IP reachable through a private network/VPN. The endpoint stays server-side, must not be exposed publicly, and is never accessed through a browser. On Vercel, `127.0.0.1` refers to the Vercel runtime, not the user's computer; the local model on a PC is therefore not available to the deployed site. A private server is not configured or provisioned by this change.

The Ollama adapter limits each request to 60 seconds, caps its response body at 64 KiB, disallows redirects, and asks for at most 900 generated tokens. Model calls are limited to one concurrent request per Node process by default (`CAGE_AI_MAX_CONCURRENT_REQUESTS`, configurable from 1 to 8 for a suitably provisioned private server). Busy requests fail quickly instead of piling up in memory. The UI also prevents duplicate submissions, aborts on unmount, and stops waiting after 65 seconds. Existing questions, model output and selected context are not written to a chat-history table.

The existing saved weekly schedule remains deterministically generated from ChessCage progress and preferences; ChessCageAI's conversational training-plan questions, explanations, tactic hints, and course answers use the configured text model. Stockfish remains responsible for chess calculations, while the model only explains supplied engine results and retrieved knowledge. Course answers still require retrieved and cited ChessCage sources.

## Changing providers

Implement `CageAiTextModelProvider` in a server-only adapter and update `getCageAiTextModelProvider()` in `lib/cage-ai/provider.ts`. The interface is independent of Ollama, so another local/open-weight runtime or a separately secured private AI server can be added without changing chat, memory, knowledge retrieval or Stockfish integration. Keep credentials server-side, preserve request/response validation and citation checks, and do not silently fall back to another provider.
