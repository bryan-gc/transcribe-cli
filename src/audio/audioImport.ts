import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { getTimestampPaths } from '../utils/fileUtils.js';
import { DEPENDENCIES, missingMessage, resolveBinary } from '../system/dependencies.js';
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
  /** True when ffmpeg had to re-encode, which is worth saying while the user waits. */
  converted: boolean;
}

const FFMPEG = DEPENDENCIES.find((d) => d.bin === Cmd.FFMPEG)!;

export function hasFfmpeg(): boolean {
  return resolveBinary(Cmd.FFMPEG) !== null;
}

/**
 * Places a copy of an existing audio file in the archive, converting it when the API would not
 * take it as is, and returns the paths its transcription should be written to.
 *
 * The original is copied rather than moved: it belongs to the user and may well be the only copy.
 */
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

  // A converted file is written as wav, matching what the recorder produces and what a local
  // engine expects; the size case becomes mp3 instead, since re-encoding to wav would grow it.
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

  // Checked here rather than at startup: recording and transcribing never need ffmpeg, and the
  // message is only useful next to the file that required it.
  const ffmpeg = resolveBinary(Cmd.FFMPEG);
  if (ffmpeg === null) {
    const reason = unsupported
      ? `${sourceExt || 'This format'} has to be converted first.`
      : 'Files over 25 MB have to be compressed first.';
    throw new ImportError(`${reason}\n${missingMessage(FFMPEG)}`);
  }

  convert(ffmpeg, sourcePath, paths.audioPath, tooLarge);
  return { ...paths, converted: true };
}

function convert(ffmpeg: string, source: string, target: string, compress: boolean): void {
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
    // 32 kbps mono at 16 kHz stays intelligible for speech and brings an hour under the limit.
    ...(compress ? ['-b:a', '32k'] : []),
    target,
  ];

  const result = spawnSync(ffmpeg, args, { encoding: Encoding.UTF8 });
  if (result.status !== 0) {
    // Leave nothing half-written: a truncated file would be uploaded and charged for.
    if (fs.existsSync(target)) fs.rmSync(target);
    const detail = (result.stderr || '').trim().split('\n').pop() ?? 'unknown error';
    throw new ImportError(`Could not convert ${path.basename(source)}: ${detail}`);
  }
}
