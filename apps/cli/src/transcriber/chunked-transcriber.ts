import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  DiarizedSegment,
  ITranscriber,
  KnownSpeaker,
  TranscribeOptions,
  TranscriptionResult,
  TranscriptionUsage,
} from './transcriber.js';
import { audioDurationSeconds } from '../audio/audio-duration.js';
import { limitsFor, needsChunking } from '../audio/chunk-plan.js';
import { COMPRESSED_EXT, convertAudio, requireFfmpeg } from '../audio/compress.js';
import { absorbShortFlips, pickReference, speakersByTalkTime } from '../speakers/pick-reference.js';
import { MAX_KNOWN_SPEAKERS } from './whisper-transcriber.js';
import {
  detectSilences,
  planCuts,
  SILENCE_LAX,
  SILENCE_STRICT,
  type Silence,
} from '../audio/silence.js';
import { splitAudio, type AudioChunk } from '../audio/split-audio.js';
import { mergeDiarized, mergeSrt } from '../utils/merge-chunks.js';
import { extractTextFromSrt } from '../utils/srt-parser.js';
import { buildGlossaryPrompt } from '../utils/glossary-prompt.js';
import { formatDuration } from '../utils/run-transcription.js';
import { DIARIZE_MODEL, Encoding, WHISPER_MODEL } from '../constants.js';

export const CHUNK_RETRY_DELAYS_MS = [5_000, 20_000];
export const CONTINUITY_WORDS = 40;

export interface ChunkStats {
  count: number;
  hardCuts: number;
  retries: number;
}

export interface ChunkedTranscriberDeps {
  cacheDir: string;
  chunkMaxMinutes: number;
  duration?: (file: string) => number | undefined;
  ffmpeg?: () => string;
  silences?: (ffmpeg: string, file: string, lax: boolean) => Silence[];
  split?: (
    ffmpeg: string,
    file: string,
    cuts: number[],
    total: number,
    dir: string,
  ) => AudioChunk[];
  sleep?: (ms: number) => Promise<void>;
  cutClip?: (ffmpeg: string, source: string, target: string, from: number, to: number) => void;
}

interface StoredPart {
  raw: string;
  segments?: DiarizedSegment[];
  engine: string;
  model: string;
  usage?: TranscriptionUsage;
  promptApplied: boolean;
}

export class ChunkedTranscriber implements ITranscriber {
  constructor(
    readonly inner: ITranscriber,
    private readonly deps: ChunkedTranscriberDeps,
  ) {}

  async transcribe(options: TranscribeOptions): Promise<TranscriptionResult> {
    const duration = (this.deps.duration ?? audioDurationSeconds)(options.audioFilePath);
    const model = options.diarize ? DIARIZE_MODEL : WHISPER_MODEL;
    const limits = limitsFor(model, this.deps.chunkMaxMinutes);
    if (!needsChunking(duration, limits)) return this.inner.transcribe(options);

    const ffmpeg = (
      this.deps.ffmpeg ?? (() => requireFfmpeg('Long audio has to be split first.'))
    )();
    const silencesOf = this.deps.silences ?? defaultSilences;
    const { cuts, hardCuts } = planCuts(
      duration!,
      limits.maxSeconds,
      silencesOf(ffmpeg, options.audioFilePath, false),
      silencesOf(ffmpeg, options.audioFilePath, true),
    );

    const workDir = this.workDirFor(options);
    fs.mkdirSync(workDir, { recursive: true });
    const chunks = (this.deps.split ?? splitAudio)(
      ffmpeg,
      options.audioFilePath,
      cuts,
      duration!,
      workDir,
    );

    const parts: StoredPart[] = [];
    let retries = 0;
    for (const chunk of chunks) {
      const stored = path.join(workDir, `${path.parse(chunk.path).name}.json`);
      if (fs.existsSync(stored)) {
        parts.push(JSON.parse(fs.readFileSync(stored, Encoding.UTF8)) as StoredPart);
        continue;
      }
      options.onProgress?.(
        `Transcribing part ${chunk.index + 1} of ${chunks.length} (${formatDuration(chunk.offsetSeconds * 1000)}–${formatDuration((chunk.offsetSeconds + chunk.durationSeconds) * 1000)})...`,
      );
      const prompt = continuityPrompt(options.prompt, parts.at(-1));
      const knownSpeakers =
        options.diarize && chunk.index > 0
          ? this.referencesFrom(ffmpeg, chunks[0]!, parts[0]!, workDir)
          : undefined;
      const { part, attempts } = await this.transcribeChunk(
        { ...options, knownSpeakers },
        chunk,
        chunks.length,
        prompt,
      );
      retries += attempts - 1;
      fs.writeFileSync(stored, JSON.stringify(part), Encoding.UTF8);
      parts.push(part);
    }

    const result = merge(parts, chunks, options.diarize === true);
    fs.rmSync(workDir, { recursive: true, force: true });
    return { ...result, chunks: { count: chunks.length, hardCuts, retries } };
  }

  private referencesFrom(
    ffmpeg: string,
    firstChunk: AudioChunk,
    firstPart: StoredPart,
    workDir: string,
  ): KnownSpeaker[] {
    const segments = absorbShortFlips(firstPart.segments ?? []);
    const speakers: KnownSpeaker[] = [];
    for (const speaker of speakersByTalkTime(segments).slice(0, MAX_KNOWN_SPEAKERS)) {
      const span = pickReference(segments, speaker);
      if (!span) continue;
      const referencePath = path.join(workDir, `speaker-${speakers.length + 1}${COMPRESSED_EXT}`);
      if (!fs.existsSync(referencePath)) {
        (this.deps.cutClip ?? defaultCutClip)(
          ffmpeg,
          firstChunk.path,
          referencePath,
          span.start,
          span.end,
        );
      }
      speakers.push({ name: firstChunkLabel(speaker), referencePath });
    }
    return speakers;
  }

  private async transcribeChunk(
    options: TranscribeOptions,
    chunk: AudioChunk,
    total: number,
    prompt: string | undefined,
  ): Promise<{ part: StoredPart; attempts: number }> {
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await this.inner.transcribe({
          ...options,
          audioFilePath: chunk.path,
          prompt,
        });
        return {
          part: {
            raw: result.raw,
            segments: result.segments,
            engine: result.engine,
            model: result.model,
            usage: result.usage,
            promptApplied: result.promptApplied,
          },
          attempts: attempt + 1,
        };
      } catch (error) {
        const delay = CHUNK_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
          const reason = error instanceof Error ? error.message : String(error);
          const failure = error instanceof Error ? error : new Error(reason);
          failure.message = `Part ${chunk.index + 1} of ${total} failed: ${reason}. The finished parts are kept; retry to continue from part ${chunk.index + 1}.`;
          throw failure;
        }
        options.onProgress?.(`Part ${chunk.index + 1} failed, retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }

  private workDirFor(options: TranscribeOptions): string {
    const stat = fs.statSync(options.audioFilePath);
    const key = crypto
      .createHash('sha1')
      .update(
        [
          path.resolve(options.audioFilePath),
          stat.size,
          stat.mtimeMs,
          options.diarize === true,
          this.deps.chunkMaxMinutes,
        ].join('|'),
      )
      .digest('hex')
      .slice(0, 12);
    return path.join(this.deps.cacheDir, key);
  }
}

export function firstChunkLabel(speaker: string): string {
  return `1·${speaker}`;
}

function defaultCutClip(ffmpeg: string, source: string, target: string, from: number, to: number) {
  convertAudio(ffmpeg, source, target, true, { from, to });
}

function defaultSilences(ffmpeg: string, file: string, lax: boolean): Silence[] {
  return detectSilences(ffmpeg, file, lax ? SILENCE_LAX : SILENCE_STRICT);
}

export function continuityPrompt(
  glossary: string | undefined,
  previous: StoredPart | undefined,
): string | undefined {
  const text = previous
    ? previous.segments
      ? previous.segments.map((s) => s.text).join(' ')
      : extractTextFromSrt(previous.raw)
    : '';
  const tail = text.split(/\s+/).filter(Boolean).slice(-CONTINUITY_WORDS).join(' ');
  return buildGlossaryPrompt([glossary ?? '', tail].filter(Boolean).join('\n'))?.text;
}

function merge(parts: StoredPart[], chunks: AudioChunk[], diarize: boolean): TranscriptionResult {
  const first = parts[0]!;
  const usage = sumUsage(parts);
  const promptApplied = parts.some((p) => p.promptApplied);
  if (diarize) {
    const segments = mergeDiarized(
      parts.map((p, i) => ({
        segments: absorbShortFlips(p.segments ?? []),
        offsetSeconds: chunks[i]!.offsetSeconds,
      })),
      {
        prefixSpeakers: true,
        knownNames: new Set(speakersByTalkTime(parts[0]!.segments ?? []).map(firstChunkLabel)),
      },
    );
    return {
      raw: JSON.stringify({ segments }),
      segments,
      engine: first.engine,
      model: first.model,
      usage,
      promptApplied,
    };
  }
  return {
    raw: mergeSrt(parts.map((p, i) => ({ srt: p.raw, offsetSeconds: chunks[i]!.offsetSeconds }))),
    engine: first.engine,
    model: first.model,
    usage,
    promptApplied,
  };
}

function sumUsage(parts: StoredPart[]): TranscriptionUsage | undefined {
  const withUsage = parts.filter((p) => p.usage);
  if (withUsage.length === 0) return undefined;
  return withUsage.reduce(
    (sum, p) => ({
      inputTokens: sum.inputTokens + p.usage!.inputTokens,
      outputTokens: sum.outputTokens + p.usage!.outputTokens,
      totalTokens: sum.totalTokens + p.usage!.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
}
