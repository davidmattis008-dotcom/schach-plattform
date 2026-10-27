import "server-only";

import type { CageAiTextModelProvider } from "./contracts.ts";
import {
  createOllamaCageAiTextModelProvider,
  resolveCageAiTextModelName,
} from "./ollama-provider.ts";

export type { CageAiTextModelProvider };

export function getCageAiTextModelProvider(): CageAiTextModelProvider | null {
  const model = resolveCageAiTextModelName(process.env.CAGE_AI_OLLAMA_MODEL);
  return createOllamaCageAiTextModelProvider({
    baseUrl: process.env.CAGE_AI_OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434",
    model,
  });
}
