import assert from "node:assert/strict";
import {
  CageAiModelUnavailableError,
  CageAiModelResponseTooLargeError,
  createOllamaCageAiTextModelProvider,
  DEFAULT_CAGE_AI_TEXT_MODEL,
  resolveCageAiTextModelName,
} from "../lib/cage-ai/ollama-provider.ts";
import { createCageAiTrainingPlanRequest } from "../lib/cage-ai/contracts.ts";
import {
  CageAiModelBusyError,
  createCageAiModelLimiter,
  resolveCageAiModelConcurrency,
} from "../lib/cage-ai/model-capacity.ts";

assert.equal(DEFAULT_CAGE_AI_TEXT_MODEL, "qwen3:4b");
assert.equal(resolveCageAiTextModelName(undefined), "qwen3:4b");
assert.equal(resolveCageAiTextModelName("  "), "qwen3:4b");
assert.equal(resolveCageAiTextModelName("qwen3:8b"), "qwen3:8b");
assert.equal(resolveCageAiModelConcurrency(undefined), 1);
assert.equal(resolveCageAiModelConcurrency("3"), 3);
assert.throws(() => resolveCageAiModelConcurrency("0"), /zwischen 1 und 8/);
assert.throws(() => resolveCageAiModelConcurrency("9"), /zwischen 1 und 8/);

let capturedUrl = "";
let capturedRequest;
let capturedHeaders;
let capturedInit;
const provider = createOllamaCageAiTextModelProvider({
  baseUrl: "http://127.0.0.1:11434/",
  model: "qwen3:8b",
  fetcher: async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    capturedRequest = JSON.parse(String(init?.body));
    capturedHeaders = init?.headers;
    return Response.json({
      message: {
        content: JSON.stringify({
          explanation: "Trainiere zweimal pro Woche Taktik.",
          sourceKeys: ["course:lesson:taktik:0"],
        }),
      },
    });
  },
});
const request = createCageAiTrainingPlanRequest("Wie sollte ich diese Woche trainieren?");
const result = await provider.explain(
  request,
  "Du bist ChessCageAI.",
  {
    purpose: "training_plan",
    memories: [{ memoryType: "goal", content: "Möchte 1800 Elo erreichen." }],
  },
  [{
    chunkId: "course:lesson:taktik:0",
    sourceKey: "course:lesson:taktik",
    title: "Taktik",
    sourceUrl: "/lernen",
    heading: "Gabeln",
    content: "Suche nach doppelten Angriffen.",
    rank: 0.5,
  }],
);
assert.equal(capturedUrl, "http://127.0.0.1:11434/api/chat");
assert.equal(capturedRequest.model, "qwen3:8b");
assert.equal(capturedRequest.stream, false);
assert.equal(capturedRequest.format.type, "object");
assert.deepEqual(capturedRequest.format.required, ["explanation"]);
assert.equal(capturedRequest.messages[1].role, "user");
assert.equal(capturedRequest.options.num_predict, 900);
assert.equal(capturedInit.redirect, "error");
assert.match(capturedRequest.messages[1].content, /Möchte 1800 Elo erreichen/);
assert.match(capturedRequest.messages[1].content, /doppelten Angriffen/);
assert.deepEqual(capturedHeaders, { "Content-Type": "application/json" });
assert.deepEqual(result, {
  explanation: "Trainiere zweimal pro Woche Taktik.",
  sourceKeys: ["course:lesson:taktik:0"],
});

const unavailableProvider = createOllamaCageAiTextModelProvider({
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen3:8b",
  fetcher: async () => new Response(null, { status: 404 }),
});
await assert.rejects(
  unavailableProvider.explain(request, "System", { purpose: "training_plan" }, []),
  CageAiModelUnavailableError,
);
const rejectedNetworkProvider = createOllamaCageAiTextModelProvider({
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen3:4b",
  fetcher: async () => { throw new Error("connection refused"); },
});
await assert.rejects(
  rejectedNetworkProvider.explain(request, "System", { purpose: "training_plan" }, []),
  CageAiModelUnavailableError,
);
const timeoutProvider = createOllamaCageAiTextModelProvider({
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen3:4b",
  timeoutMs: 1,
  fetcher: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }),
});
const timeoutKeepAlive = setTimeout(() => {}, 100);
await assert.rejects(
  timeoutProvider.explain(request, "System", { purpose: "training_plan" }, []),
  CageAiModelUnavailableError,
);
clearTimeout(timeoutKeepAlive);

const malformedProvider = createOllamaCageAiTextModelProvider({
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen3:8b",
  fetcher: async () => Response.json({ message: { content: "not json" } }),
});
await assert.rejects(
  malformedProvider.explain(request, "System", { purpose: "training_plan" }, []),
  /keine gültige ChessCageAI-JSON-Antwort/,
);

assert.throws(
  () => createOllamaCageAiTextModelProvider({
    baseUrl: "https://user:password@example.test",
    model: "qwen3:8b",
  }),
  /ohne Zugangsdaten/,
);
assert.throws(
  () => createOllamaCageAiTextModelProvider({
    baseUrl: "https://api.ollama.com",
    model: "qwen3:4b",
  }),
  /nur lokal oder über eine private Netzwerkadresse/,
);
assert.equal(
  createOllamaCageAiTextModelProvider({
    baseUrl: "http://192.168.1.5:11434",
    model: "qwen3:4b",
  }) instanceof Object,
  true,
);
assert.equal(
  createOllamaCageAiTextModelProvider({
    baseUrl: "http://10.10.0.8:11434",
    model: "qwen3:4b",
    fetcher: async () => Response.json({
      message: { content: JSON.stringify({ explanation: "Private Ollama funktioniert." }) },
    }),
  }) instanceof Object,
  true,
);
assert.throws(
  () => createOllamaCageAiTextModelProvider({
    baseUrl: "http://127.0.0.1:11434",
    model: " ",
  }),
  /Modellname ist ungültig/,
);

const limiter = createCageAiModelLimiter(1);
let releaseFirstRequest;
const firstRequest = limiter(() => new Promise((resolve) => {
  releaseFirstRequest = resolve;
}));
await new Promise((resolve) => setImmediate(resolve));
await assert.rejects(
  limiter(async () => "second"),
  CageAiModelBusyError,
);
releaseFirstRequest("first");
assert.equal(await firstRequest, "first");
assert.equal(await limiter(async () => "after release"), "after release");

const oversizedProvider = createOllamaCageAiTextModelProvider({
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen3:4b",
  fetcher: async () => new Response(
    JSON.stringify({ message: { content: "x".repeat(70 * 1024) } }),
    { headers: { "Content-Type": "application/json" } },
  ),
});
await assert.rejects(
  oversizedProvider.explain(request, "System", { purpose: "training_plan" }, []),
  CageAiModelResponseTooLargeError,
);
