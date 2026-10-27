# ChessCageAI speech

Speech is an optional browser-side addition; the existing authenticated text chat remains the source of truth.

- Speech recognition uses the open `Xenova/whisper-tiny` model through Transformers.js/ONNX Runtime WebAssembly.
- Model inference runs on the user's device. Whisper weights are downloaded from the Hugging Face model hub on first use and cached by the browser; audio is never sent to that host or to an AI service.
- German speech output uses the browser's installed operating-system voice, and only when the browser marks that voice as local. No speech-generation request or audio is sent to a service. If no local German voice is installed, ChessCageAI reports that limitation and leaves the text answer available.
- The candidate `Xenova/mms-tts-deu` weights were not used because their upstream license is CC-BY-NC 4.0.
- The browser asks for microphone permission only after the user presses the microphone button. Recordings stop after 20 seconds or 10 MiB, are converted to a temporary in-memory Blob URL for local inference, and the URL is revoked immediately after transcription. No recording is uploaded or persisted.
- The recognized text is inserted into the ordinary question field for review. Only after the user submits it is the text sent to `/api/cage-ai/explain`, which keeps its existing authentication and validation.
- Speech output is generated locally from the displayed ChessCageAI response and played in memory; no audio file is written.
- Browsers without microphone/MediaRecorder support keep the text chat available and explain why voice input cannot start. The read-aloud button requires an installed local German speech voice; otherwise ChessCageAI shows an explanatory error and keeps the text answer available.

The provider interfaces in `lib/cage-ai/speech-contracts.ts` keep speech recognition and synthesis separate from `CageAiTextModelProvider`. A future voice-call client can compose those providers with the existing text-chat API without adding audio handling to the authenticated server route or changing the Ollama/qwen3:4b adapter. Audio recordings are currently turn-based; this is not a continuous-call implementation.
