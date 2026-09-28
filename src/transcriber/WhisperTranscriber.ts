import fs from 'fs';
import { promptAsLine } from '../utils/glossaryPrompt.js';
import path from 'path';
import OpenAI from 'openai';
import type {
  ITranscriber,
  KnownSpeaker,
  TranscribeOptions,
  TranscriptionResult,
  TranscriptionUsage,
} from './ITranscriber.js';
import { Engine } from '../config/configManager.js';
import { parseDiarized } from '../utils/diarizedParser.js';
import { compressForUpload, type Compressor } from '../audio/compress.js';
import { limitsFor, needsCompression } from '../audio/chunkPlan.js';
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

export const MAX_KNOWN_SPEAKERS = 4;

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.flac': 'audio/flac',
};

export function speakerReferences(speakers: KnownSpeaker[]): {
  known_speaker_names: string[];
  known_speaker_references: string[];
} {
  const chosen = speakers.slice(0, MAX_KNOWN_SPEAKERS);
  return {
    known_speaker_names: chosen.map((s) => s.name),
    known_speaker_references: chosen.map((s) => {
      const mime = AUDIO_MIME[path.extname(s.referencePath).toLowerCase()] ?? 'audio/mpeg';
      return `data:${mime};base64,${fs.readFileSync(s.referencePath).toString('base64')}`;
    }),
  };
}

export class WhisperTranscriber implements ITranscriber {
  private openai: OpenAI;

  constructor(
    apiKey: string,
    fetchImpl?: typeof fetch,
    private readonly compress: Compressor = compressForUpload,
  ) {
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
    const model = diarize ? DIARIZE_MODEL : WHISPER_MODEL;
    const tooLarge = needsCompression(fs.statSync(options.audioFilePath).size, limitsFor(model));
    if (tooLarge) options.onProgress?.('Compressing audio for upload...');
    const uploadPath = tooLarge ? this.compress(options.audioFilePath) : options.audioFilePath;
    try {
      return await this.send(options, uploadPath, diarize, model);
    } finally {
      if (uploadPath !== options.audioFilePath) {
        fs.rmSync(path.dirname(uploadPath), { recursive: true, force: true });
      }
    }
  }

  private async send(
    options: TranscribeOptions,
    uploadPath: string,
    diarize: boolean,
    model: string,
  ): Promise<TranscriptionResult> {
    const sendPrompt = !diarize && Boolean(options.prompt);
    options.onProgress?.('Preparing audio stream...');
    const fileStream = fs.createReadStream(uploadPath);

    options.onProgress?.(
      diarize
        ? 'Sending request to OpenAI (transcribing and labelling speakers)...'
        : 'Sending request to OpenAI Whisper API (uploading & processing)...',
    );

    const response = await this.openai.audio.transcriptions.create({
      file: fileStream,
      model,
      language: options.language,
      response_format: diarize ? TranscriptionFormat.DIARIZED : options.format,
      ...(diarize ? { chunking_strategy: DIARIZE_CHUNKING } : {}),
      ...(diarize && options.knownSpeakers?.length ? speakerReferences(options.knownSpeakers) : {}),
      ...(sendPrompt && options.prompt ? { prompt: promptAsLine(options.prompt) } : {}),
    });

    options.onProgress?.('Response received from OpenAI.');

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
