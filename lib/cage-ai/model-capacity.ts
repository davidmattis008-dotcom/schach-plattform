export class CageAiModelBusyError extends Error {
  constructor() {
    super("ChessCageAI verarbeitet gerade eine andere Anfrage. Bitte versuche es gleich erneut.");
    this.name = "CageAiModelBusyError";
  }
}

export function resolveCageAiModelConcurrency(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 1;
  const concurrency = Number(value);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("CAGE_AI_MAX_CONCURRENT_REQUESTS muss eine ganze Zahl zwischen 1 und 8 sein.");
  }
  return concurrency;
}

export function createCageAiModelLimiter(maxConcurrent = 1) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 8) {
    throw new Error("ChessCageAI-Modellparallelität muss zwischen 1 und 8 liegen.");
  }
  let activeRequests = 0;

  return async function run<T>(operation: () => Promise<T>): Promise<T> {
    if (activeRequests >= maxConcurrent) throw new CageAiModelBusyError();
    activeRequests += 1;
    try {
      return await operation();
    } finally {
      activeRequests -= 1;
    }
  };
}

export const runCageAiModelRequest = createCageAiModelLimiter(
  resolveCageAiModelConcurrency(process.env.CAGE_AI_MAX_CONCURRENT_REQUESTS),
);
