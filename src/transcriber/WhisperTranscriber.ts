import fs from 'fs';
import OpenAI from 'openai';
import type { ITranscriber, TranscribeOptions, TranscriptionResult } from './ITranscriber.js';
import { parseDiarized } from '../utils/diarizedParser.js';
import {
  DIARIZE_CHUNKING,
  DIARIZE_MODEL,
  REQUEST_TIMEOUT_MS,
  SDK_MAX_RETRIES,
  TranscriptionFormat,
  WHISPER_MODEL,
} from '../constants.js';

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
      maxRetries: SDK_MAX_RETRIES,
      timeout: REQUEST_TIMEOUT_MS,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }

  async transcribe(options: TranscribeOptions): Promise<TranscriptionResult> {
    if (!fs.existsSync(options.audioFilePath)) {
      throw new Error(`Audio file not found: ${options.audioFilePath}`);
    }

    const diarize = options.diarize === true;
    options.onProgress?.('Preparing audio stream...');
    const fileStream = fs.createReadStream(options.audioFilePath);

    options.onProgress?.(
      diarize
        ? 'Sending request to OpenAI (transcribing and labelling speakers)...'
        : 'Sending request to OpenAI Whisper API (uploading & processing)...',
    );

    const response = await this.openai.audio.transcriptions.create({
      file: fileStream,
      model: diarize ? DIARIZE_MODEL : WHISPER_MODEL,
      language: options.language,
      response_format: diarize ? TranscriptionFormat.DIARIZED : options.format,
      // Anything past 30 seconds is refused without this, and most recordings are longer.
      ...(diarize ? { chunking_strategy: DIARIZE_CHUNKING } : {}),
      ...(options.prompt ? { prompt: options.prompt } : {}),
    });

    // Errors propagate untouched: Ink owns stdout, so logging here paints over the rendered UI.
    // The caller turns the failure into a status message.
    options.onProgress?.('Response received from OpenAI.');

    if (!diarize) return { raw: response as unknown as string };

    const raw = typeof response === 'string' ? response : JSON.stringify(response);
    return { raw, segments: parseDiarized(raw) };
  }
}
