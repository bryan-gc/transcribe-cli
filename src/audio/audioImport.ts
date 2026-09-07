import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { getTimestampPaths } from '../utils/fileUtils.js';
import {
  Cmd,
  Encoding,
  EXT,
  MAX_UPLOAD_BYTES,
  RecordingKind,
  StdioOption,
  SUPPORTED_IMPORT_EXT,
  AUDIO_CONFIG,
} from '../constants.js';

export class ImportError extends Error {}

export interface ImportedAudio {
  audioPath: string;
  srtPath: string;
  textPath: string;
  diarizedPath: string;
  converted: boolean;
}

export function hasFfmpeg(): boolean {
  return spawnSync(Cmd.FFMPEG, ['-version'], { stdio: StdioOption.IGNORE }).status === 0;
}

export function prepareImportedAudio(
  sourcePath: string,
  basePath: string,
  now: Date = new Date(),
): ImportedAudio {
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new ImportError(`File not found: ${sourcePath}`);
  }

  const sourceExt = path.extname(sourcePath).toLowerCase();
  const tooLarge = fs.statSync(sourcePath).size > MAX_UPLOAD_BYTES;
  const unsupported = !SUPPORTED_IMPORT_EXT.has(sourceExt);
  const converted = tooLarge || unsupported;

  const audioExt = !converted ? sourceExt : tooLarge ? '.mp3' : EXT.AUDIO;
  const paths = getTimestampPaths(basePath, RecordingKind.IMPORTED, {
    now,
    originalName: path.basename(sourcePath),
    audioExt,
  });

  if (!converted) {
    fs.copyFileSync(sourcePath, paths.audioPath);
    return { ...paths, converted: false };
  }

  if (!hasFfmpeg()) {
    throw new ImportError(
      unsupported
        ? `${sourceExt || 'This format'} has to be converted, which needs ffmpeg. Install it with: sudo apt install ffmpeg`
        : `Files over 25 MB have to be compressed, which needs ffmpeg. Install it with: sudo apt install ffmpeg`,
    );
  }

  convert(sourcePath, paths.audioPath, tooLarge);
  return { ...paths, converted: true };
}

function convert(source: string, target: string, compress: boolean): void {
  const args = [
    '-y',
    '-loglevel',
    'error',
    '-i',
    source,
    '-vn',
    '-ar',
    AUDIO_CONFIG.SAMPLE_RATE,
    '-ac',
    AUDIO_CONFIG.CHANNELS,
    ...(compress ? ['-b:a', '32k'] : []),
    target,
  ];

  const result = spawnSync(Cmd.FFMPEG, args, { encoding: Encoding.UTF8 });
  if (result.status !== 0) {
    if (fs.existsSync(target)) fs.rmSync(target);
    const detail = (result.stderr || '').trim().split('\n').pop() ?? 'unknown error';
    throw new ImportError(`Could not convert ${path.basename(source)}: ${detail}`);
  }
}
