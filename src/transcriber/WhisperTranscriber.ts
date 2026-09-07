import fs from 'fs';
import OpenAI from 'openai';
import type { ITranscriber } from './ITranscriber.js';
import { LanguageCode, TranscriptionFormat, WHISPER_MODEL } from '../constants.js';

export class WhisperTranscriber implements ITranscriber {
  private openai: OpenAI;

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

    onProgress?.('Response received from OpenAI.');
    return response as unknown as string;
  }
}
