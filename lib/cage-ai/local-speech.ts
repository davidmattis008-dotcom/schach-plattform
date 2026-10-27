import type { AutomaticSpeechRecognitionPipelineType } from "@huggingface/transformers";
import {
  selectLocalGermanVoice,
  validateCageAiSpeechRecording,
  validateCageAiSpokenAnswer,
  type CageAiSpeechToTextProvider,
  type CageAiTextToSpeechProvider,
} from "./speech-contracts.ts";

const SPEECH_TO_TEXT_MODEL = "Xenova/whisper-tiny";

let speechToTextPipeline: Promise<AutomaticSpeechRecognitionPipelineType> | null = null;

function getSpeechToTextPipeline() {
  if (!speechToTextPipeline) {
    speechToTextPipeline = import("@huggingface/transformers")
      .then(({ pipeline }) => pipeline("automatic-speech-recognition", SPEECH_TO_TEXT_MODEL, {
        dtype: "q8",
        device: "wasm",
      }))
      .catch((error: unknown) => {
        speechToTextPipeline = null;
        throw new Error(
          "Das lokale ChessCageAI-Spracherkennungsmodell konnte nicht geladen werden.",
          { cause: error },
        );
      });
  }
  return speechToTextPipeline;
}

export function createLocalCageAiSpeechToTextProvider(): CageAiSpeechToTextProvider {
  return {
    async transcribe(audio) {
      validateCageAiSpeechRecording(audio);
      const audioUrl = URL.createObjectURL(audio);
      try {
        const transcriber = await getSpeechToTextPipeline();
        const output = await transcriber(audioUrl, {
          language: "german",
          task: "transcribe",
        });
        const text = Array.isArray(output) ? output[0]?.text : output.text;
        if (typeof text !== "string" || !text.trim()) {
          throw new Error("ChessCageAI konnte in der Aufnahme keine Sprache erkennen.");
        }
        return text.trim().slice(0, 500);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("ChessCageAI")) throw error;
        throw new Error("ChessCageAI konnte die Aufnahme lokal nicht erkennen.", { cause: error });
      } finally {
        URL.revokeObjectURL(audioUrl);
      }
    },
  };
}

export function createLocalCageAiTextToSpeechProvider(): CageAiTextToSpeechProvider {
  let utterance: SpeechSynthesisUtterance | null = null;
  let finishPlayback: (() => void) | null = null;

  return {
    async speak(text, onPlaybackStart) {
      const normalized = validateCageAiSpokenAnswer(text);
      if (typeof window === "undefined" || !window.speechSynthesis
        || typeof SpeechSynthesisUtterance === "undefined") {
        throw new Error("Dieser Browser unterstützt keine lokale ChessCageAI-Sprachausgabe.");
      }
      this.stop();
      const voice = selectLocalGermanVoice(window.speechSynthesis.getVoices());
      if (!voice) {
        throw new Error("ChessCageAI hat keine lokale deutsche Sprachstimme gefunden. Installiere eine deutsche Systemstimme; der Text-Chat funktioniert weiterhin.");
      }

      const currentUtterance = new SpeechSynthesisUtterance(normalized);
      currentUtterance.voice = voice;
      currentUtterance.lang = voice.lang;
      currentUtterance.onstart = () => onPlaybackStart?.();
      utterance = currentUtterance;
      await new Promise<void>((resolve, reject) => {
        const complete = () => {
          if (utterance === currentUtterance) {
            utterance = null;
            finishPlayback = null;
          }
          resolve();
        };
        finishPlayback = complete;
        currentUtterance.onend = complete;
        currentUtterance.onerror = () => {
          if (utterance === currentUtterance) {
            utterance = null;
            finishPlayback = null;
          }
          reject(new Error("Die lokale ChessCageAI-Sprachausgabe wurde vom Browser beendet."));
        };
        window.speechSynthesis.speak(currentUtterance);
      });
    },
    stop() {
      const finish = finishPlayback;
      utterance = null;
      finishPlayback = null;
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      finish?.();
    },
  };
}
