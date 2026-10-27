import assert from "node:assert/strict";
import {
  CAGE_AI_MAX_RECORDING_BYTES,
  CAGE_AI_MAX_RECORDING_SECONDS,
  CAGE_AI_MAX_SPOKEN_ANSWER_LENGTH,
  isCageAiSpeechInputSupported,
  selectLocalGermanVoice,
  validateCageAiSpeechRecording,
  validateCageAiSpokenAnswer,
} from "../lib/cage-ai/speech-contracts.ts";
import { createLocalCageAiTextToSpeechProvider } from "../lib/cage-ai/local-speech.ts";

assert.equal(CAGE_AI_MAX_RECORDING_SECONDS, 20);
assert.equal(CAGE_AI_MAX_RECORDING_BYTES, 10 * 1024 * 1024);
assert.equal(CAGE_AI_MAX_SPOKEN_ANSWER_LENGTH, 2_000);
assert.equal(isCageAiSpeechInputSupported(false, true), false);
assert.equal(isCageAiSpeechInputSupported(true, false), false);
assert.equal(isCageAiSpeechInputSupported(true, true), true);
assert.throws(
  () => validateCageAiSpeechRecording(new Blob([])),
  /ChessCageAI-Aufnahme enthält kein Audio/,
);
assert.throws(
  () => validateCageAiSpeechRecording(new Blob([new Uint8Array(CAGE_AI_MAX_RECORDING_BYTES + 1)])),
  /ChessCageAI-Aufnahme ist zu groß/,
);
assert.doesNotThrow(
  () => validateCageAiSpeechRecording(new Blob([new Uint8Array(128)])),
);
assert.throws(
  () => validateCageAiSpokenAnswer("  "),
  /keinen Antworttext/,
);
assert.equal(validateCageAiSpokenAnswer("  Hallo!  "), "Hallo!");
const localVoice = { lang: "de-DE", localService: true, name: "Systemstimme" };
assert.equal(selectLocalGermanVoice([
  { lang: "de-DE", localService: false, name: "Onlinestimme" },
  { lang: "en-US", localService: true, name: "Lokale englische Stimme" },
  localVoice,
]), localVoice);
assert.equal(selectLocalGermanVoice([]), null);
const originalWindow = globalThis.window;
const originalUtterance = globalThis.SpeechSynthesisUtterance;
const spoken = [];
let playbackStarted = false;
class TestUtterance {
  constructor(text) {
    this.text = text;
    this.voice = null;
    this.lang = "";
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }
}
globalThis.SpeechSynthesisUtterance = TestUtterance;
globalThis.window = {
  speechSynthesis: {
    getVoices: () => [localVoice],
    speak: (utterance) => {
      spoken.push(utterance);
      utterance.onstart?.();
      utterance.onend?.();
    },
    cancel: () => {},
  },
};
try {
  const provider = createLocalCageAiTextToSpeechProvider();
  await provider.speak("Königssicherheit prüfen.", () => { playbackStarted = true; });
  assert.equal(spoken[0].text, "Königssicherheit prüfen.");
  assert.equal(spoken[0].voice, localVoice);
  assert.equal(spoken[0].lang, "de-DE");
  assert.equal(playbackStarted, true);

  globalThis.window.speechSynthesis.getVoices = () => [];
  await assert.rejects(provider.speak("Hallo"), /keine lokale deutsche Sprachstimme/);

  globalThis.window = {};
  await assert.rejects(provider.speak("Hallo"), /unterstützt keine lokale/);
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
  else globalThis.SpeechSynthesisUtterance = originalUtterance;
}
assert.equal(
  validateCageAiSpokenAnswer("x".repeat(CAGE_AI_MAX_SPOKEN_ANSWER_LENGTH + 1)).length,
  CAGE_AI_MAX_SPOKEN_ANSWER_LENGTH,
);
console.log("Validated ChessCageAI local speech limits, local German voice selection, and bounded audio/text.");
