import fs from 'fs';
import OpenAI from 'openai';
import type {
  ITranscriber,
  TranscribeOptions,
  TranscriptionResult,
  TranscriptionUsage,
} from './ITranscriber.js';
import { Engine } from '../config/configManager.js';
import { parseDiarized } from '../utils/diarizedParser.js';
import {
  DIARIZE_CHUNKING,
  DIARIZE_MODEL,
  REQUEST_TIMEOUT_MS,
  SDK_MAX_RETRIES,
  TranscriptionFormat,
  WHISPER_MODEL,
} from '../constants.js';

function readUsage(response: unknown): TranscriptionUsage | undefined {
  const usage = (response as { usage?: Record<string, number> })?.usage;
  if (!usage) return undefined;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: usage.total_tokens ?? input + output,
  };
}

export class WhisperTranscriber implements ITranscriber {
  private openai: OpenAI;

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
    const sendPrompt = !diarize && Boolean(options.prompt);
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
      ...(diarize ? { chunking_strategy: DIARIZE_CHUNKING } : {}),
      ...(sendPrompt ? { prompt: options.prompt } : {}),
    });

    options.onProgress?.('Response received from OpenAI.');

    const model = diarize ? DIARIZE_MODEL : WHISPER_MODEL;
    if (!diarize) {
      return {
        raw: response as unknown as string,
        engine: Engine.OPENAI,
        model,
        promptApplied: sendPrompt,
      };
    }

    const raw = typeof response === 'string' ? response : JSON.stringify(response);
    return {
      raw,
      segments: parseDiarized(raw),
      engine: Engine.OPENAI,
      model,
      usage: readUsage(response),
      promptApplied: false,
    };
  }
}
