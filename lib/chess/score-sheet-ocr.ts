export type ScoreSheetOcrProvider = {
  id: string;
  recognize(image: HTMLCanvasElement): Promise<Array<{ text: string }>>;
};

const SCORE_SHEET_OCR_MODEL = "Xenova/trocr-small-handwritten";

type ImageToTextPipeline = import("@huggingface/transformers").ImageToTextPipeline;

let pipelinePromise: Promise<ImageToTextPipeline> | null = null;

async function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = import("@huggingface/transformers")
      .then(({ pipeline }) => pipeline("image-to-text", SCORE_SHEET_OCR_MODEL, {
        dtype: "q8",
        device: "wasm",
      }))
      .catch((error: unknown) => {
        pipelinePromise = null;
        throw new Error(
          "Das kostenlose Handschriftmodell konnte nicht geladen werden. Prüfe deine Internetverbindung oder versuche es später erneut.",
          { cause: error },
        );
      });
  }
  return pipelinePromise;
}

export function createLocalScoreSheetOcrProvider(): ScoreSheetOcrProvider {
  return {
    id: SCORE_SHEET_OCR_MODEL,
    async recognize(image) {
      const recognize = await getPipeline();
      const outputs = await recognize(image, {
        num_beams: 3,
        num_return_sequences: 3,
        max_new_tokens: 24,
      });
      return outputs.flat()
        .map(({ generated_text }) => ({ text: generated_text.trim() }))
        .filter(({ text }) => text);
    },
  };
}
