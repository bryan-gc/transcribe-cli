import fs from 'fs';
import OpenAI from 'openai';
import type { ITranscriber } from './ITranscriber.js';
import { LanguageCode, TranscriptionFormat, WHISPER_MODEL } from '../constants.js';

export class WhisperTranscriber implements ITranscriber {
  private openai: OpenAI;

  /**
   * @param fetchImpl Replaces the transport. Tests pass a stub to assert on the request that
   *                  would go out, which is the only way to cover the request shape without a
   *                  network round trip and a paid call.
   */
  constructor(apiKey: string, fetchImpl?: typeof fetch) {
    this.openai = new OpenAI({
      apiKey,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }

  async transcribe(
    audioFilePath: string,
    language: LanguageCode = LanguageCode.ENGLISH,
    format: TranscriptionFormat = TranscriptionFormat.TEXT,
    prompt?: string,
    onProgress?: (status: string) => void,
  ): Promise<string> {
    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found: ${audioFilePath}`);
    }

    onProgress?.('Preparing audio stream...');
    const fileStream = fs.createReadStream(audioFilePath);

    onProgress?.('Sending request to OpenAI Whisper API (uploading & processing)...');
    const response = await this.openai.audio.transcriptions.create({
      file: fileStream,
      model: WHISPER_MODEL,
      language,
      response_format: format,
      ...(prompt ? { prompt } : {}),
    });

    // Errors propagate untouched: Ink owns stdout, so logging here paints over the rendered UI.
    // The caller turns the failure into a status message.
    onProgress?.('Response received from OpenAI.');
    return response as unknown as string;
  }
}
