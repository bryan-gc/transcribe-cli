import fs from 'fs';
import path from 'path';
import { convertAudio } from './compress.js';
import { getTimestampPaths } from '../utils/file-utils.js';
import { DEPENDENCIES, missingMessage, resolveBinary } from '../system/dependencies.js';
import { Cmd, EXT, MAX_UPLOAD_BYTES, RecordingKind, SUPPORTED_IMPORT_EXT } from '../constants.js';

export class ImportError extends Error {}

export interface ImportedAudio {
  audioPath: string;
  srtPath: string;
  textPath: string;
  diarizedPath: string;
  metaPath: string;
  converted: boolean;
}

const FFMPEG = DEPENDENCIES.find((d) => d.bin === Cmd.FFMPEG)!;

export function hasFfmpeg(): boolean {
  return resolveBinary(Cmd.FFMPEG) !== null;
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

  const ffmpeg = resolveBinary(Cmd.FFMPEG);
  if (ffmpeg === null) {
    const reason = unsupported
      ? `${sourceExt || 'This format'} has to be converted first.`
      : 'Files over 25 MB have to be compressed first.';
    throw new ImportError(`${reason}\n${missingMessage(FFMPEG)}`);
  }

  try {
    convertAudio(ffmpeg, sourcePath, paths.audioPath, tooLarge);
  } catch (error) {
    throw new ImportError(error instanceof Error ? error.message : String(error));
  }
  return { ...paths, converted: true };
}
