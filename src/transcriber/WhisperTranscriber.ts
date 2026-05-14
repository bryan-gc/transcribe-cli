import fs from 'fs';
import OpenAI from 'openai';
import type { ITranscriber } from './ITranscriber.js';
import { config } from '../config/env.js';
import { LanguageCode } from './LanguageEnum.js';
import { TranscriptionFormat, WHISPER_MODEL } from './TranscriptionFormat.js';

export class WhisperTranscriber implements ITranscriber {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
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

    try {
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
    } catch (error) {
      console.error('Whisper transcription error:', error);
      throw error;
    }
  }
}
