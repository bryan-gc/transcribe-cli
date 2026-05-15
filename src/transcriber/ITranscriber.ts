import type { LanguageCode, TranscriptionFormat } from '../constants';

export interface ITranscriber {
  /**
   * Transcribes an audio file and returns the result as a string.
   * @param audioFilePath Absolute or relative path to the audio file.
   * @param language      Language code for the audio content.
   * @param format        Desired response format.
   * @param prompt        Optional context hint / glossary for the model.
   */
  transcribe(
    audioFilePath: string,
    language: LanguageCode,
    format: TranscriptionFormat,
    prompt?: string,
    onProgress?: (status: string) => void,
  ): Promise<string>;
}
