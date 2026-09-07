import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import type { ITranscriber, TranscribeOptions, TranscriptionResult } from './ITranscriber.js';
import { Engine, type LocalWhisperConfig } from '../config/configManager.js';
import { Encoding, EXT, ProcessEvent, StdioOption, TranscriptionFormat } from '../constants.js';

export class LocalWhisperError extends Error {}

export class LocalWhisperTranscriber implements ITranscriber {
  private process: ChildProcess | null = null;

  constructor(private readonly config: LocalWhisperConfig) {}

  async transcribe(options: TranscribeOptions): Promise<TranscriptionResult> {
    if (!fs.existsSync(options.audioFilePath)) {
      throw new Error(`Audio file not found: ${options.audioFilePath}`);
    }
    if (options.diarize) {
      throw new LocalWhisperError(
        'Speaker labels are not available from the local engine yet. Drop --local to use the API, or drop --speakers.',
      );
    }
    if (!fs.existsSync(this.config.binPath)) {
      throw new LocalWhisperError(
        `WhisperX not found at ${this.config.binPath}. Install it with scripts/install-whisperx.sh, or set the path with transcribe-cli setup.`,
      );
    }

    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisperx-'));
    try {
      await this.run(buildArgs(this.config, options, outputDir), options.onProgress);

      const written = fs.readdirSync(outputDir).find((f) => f.endsWith(EXT.SUBTITLES));
      if (!written) {
        throw new LocalWhisperError('WhisperX finished without writing a transcription.');
      }
      return {
        raw: fs.readFileSync(path.join(outputDir, written), Encoding.UTF8),
        engine: Engine.LOCAL,
        model: this.config.model,
      };
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  }

  cancel(): void {
    this.process?.kill();
    this.process = null;
  }

  private run(args: string[], onProgress?: (status: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      onProgress?.(
        `Transcribing locally with ${this.config.model} (the first run loads the model)...`,
      );
      const child = spawn(this.config.binPath, args, {
        stdio: [StdioOption.IGNORE, StdioOption.PIPE, StdioOption.PIPE],
      });
      this.process = child;

      const errorOutput: string[] = [];
      child.stderr?.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          if (line.trim() !== '') errorOutput.push(line.trimEnd());
        }
      });

      child.on(ProcessEvent.ERROR, (error) => {
        this.process = null;
        reject(new LocalWhisperError(`Could not start WhisperX: ${error.message}`));
      });
      child.on(ProcessEvent.CLOSE, (code) => {
        this.process = null;
        if (code === 0) return resolve();
        reject(
          new LocalWhisperError(`WhisperX exited with code ${code}: ${summarize(errorOutput)}`),
        );
      });
    });
  }
}

const PYTHON_NOISE =
  /^\s*(warn(ings)?\.warn\(|>>>|import torch|torch\.|See https|It can be re-enabled|Lightning automatically)/;

function summarize(lines: string[]): string {
  const meaningful = lines.filter((line) => !PYTHON_NOISE.test(line) && !/Warning:/.test(line));
  const chosen = meaningful.length > 0 ? meaningful : lines;
  return chosen.slice(-2).join(' ').slice(0, 200) || 'no output';
}

export function buildArgs(
  config: LocalWhisperConfig,
  options: TranscribeOptions,
  outputDir: string,
): string[] {
  return [
    options.audioFilePath,
    '--model',
    config.model,
    '--language',
    options.language,
    '--device',
    config.device,
    '--compute_type',
    config.computeType,
    '--segment_resolution',
    'sentence',
    '--output_format',
    TranscriptionFormat.SRT,
    '--output_dir',
    outputDir,
    '--print_progress',
    'True',
  ];
}
