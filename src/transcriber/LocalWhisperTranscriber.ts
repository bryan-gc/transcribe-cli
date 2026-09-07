import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import type { ITranscriber, TranscribeOptions, TranscriptionResult } from './ITranscriber.js';
import type { LocalWhisperConfig } from '../config/configManager.js';
import { Encoding, EXT, ProcessEvent, StdioOption, TranscriptionFormat } from '../constants.js';

export class LocalWhisperError extends Error {}

/**
 * Transcribes with a local WhisperX install instead of the API.
 *
 * WhisperX writes subtitles itself, so the result reaching the rest of the app is the same SRT a
 * remote transcription produces and nothing downstream has to know which engine ran.
 */
export class LocalWhisperTranscriber implements ITranscriber {
  private process: ChildProcess | null = null;

  constructor(private readonly config: LocalWhisperConfig) {}

  async transcribe(options: TranscribeOptions): Promise<TranscriptionResult> {
    if (!fs.existsSync(options.audioFilePath)) {
      throw new Error(`Audio file not found: ${options.audioFilePath}`);
    }
    if (options.diarize) {
      // Better than transcribing without labels and letting the user find out from the result.
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

      // WhisperX names the output after the input, so the one .srt in the directory is ours.
      const written = fs.readdirSync(outputDir).find((f) => f.endsWith(EXT.SUBTITLES));
      if (!written) {
        throw new LocalWhisperError('WhisperX finished without writing a transcription.');
      }
      return { raw: fs.readFileSync(path.join(outputDir, written), Encoding.UTF8) };
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  }

  /** Stops a run in progress. An orphaned WhisperX keeps a core busy for minutes. */
  cancel(): void {
    this.process?.kill();
    this.process = null;
  }

  private run(args: string[], onProgress?: (status: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      onProgress?.('Loading the local model (the first run downloads it)...');
      const child = spawn(this.config.binPath, args, {
        stdio: [StdioOption.IGNORE, StdioOption.PIPE, StdioOption.PIPE],
      });
      this.process = child;

      // WhisperX reports progress on stderr; the last line is also the error when it fails.
      let lastLine = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        if (lines.length === 0) return;
        lastLine = lines[lines.length - 1]!.trim();
        onProgress?.(lastLine.slice(0, 80));
      });

      child.on(ProcessEvent.ERROR, (error) => {
        this.process = null;
        reject(new LocalWhisperError(`Could not start WhisperX: ${error.message}`));
      });
      child.on(ProcessEvent.CLOSE, (code) => {
        this.process = null;
        if (code === 0) return resolve();
        reject(new LocalWhisperError(`WhisperX exited with code ${code}: ${lastLine}`));
      });
    });
  }
}

/**
 * Builds the command line for one run.
 *
 * `--segment_resolution sentence` is not optional. WhisperX chunks at 30 seconds by default, so a
 * shorter recording comes back as a single subtitle spanning the whole thing, and the alignment
 * pass does not split it either: it refines the timings of segments that already exist.
 */
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
