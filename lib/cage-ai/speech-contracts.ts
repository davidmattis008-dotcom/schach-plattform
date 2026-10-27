export const CAGE_AI_MAX_RECORDING_SECONDS = 20;
export const CAGE_AI_MAX_RECORDING_BYTES = 10 * 1024 * 1024;
export const CAGE_AI_MAX_SPOKEN_ANSWER_LENGTH = 2_000;

export interface CageAiSpeechToTextProvider {
  transcribe(audio: Blob): Promise<string>;
}

export interface CageAiTextToSpeechProvider {
  speak(text: string, onPlaybackStart?: () => void): Promise<void>;
  stop(): void;
}

export function isCageAiSpeechInputSupported(hasGetUserMedia: boolean, hasMediaRecorder: boolean): boolean {
  return hasGetUserMedia && hasMediaRecorder;
}

export function validateCageAiSpeechRecording(audio: Blob): void {
  if (audio.size === 0) throw new Error("Die ChessCageAI-Aufnahme enthält kein Audio.");
  if (audio.size > CAGE_AI_MAX_RECORDING_BYTES) {
    throw new Error("Die ChessCageAI-Aufnahme ist zu groß. Bitte sprich höchstens 20 Sekunden.");
  }
}

export function validateCageAiSpokenAnswer(text: string): string {
  const normalized = text.trim();
  if (!normalized) throw new Error("ChessCageAI hat keinen Antworttext zum Vorlesen.");
  return normalized.slice(0, CAGE_AI_MAX_SPOKEN_ANSWER_LENGTH);
}

export function selectLocalGermanVoice<T extends { lang: string; localService: boolean }>(
  voices: readonly T[],
): T | null {
  return voices.find((voice) => voice.localService && voice.lang.toLowerCase().startsWith("de")) ?? null;
}
