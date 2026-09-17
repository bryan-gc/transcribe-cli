import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { DEPENDENCIES, missingMessage, resolveBinary } from '../system/dependencies.js';
import { AUDIO_CONFIG, Cmd, Encoding } from '../constants.js';

export const COMPRESSED_BITRATE = '32k';
export const COMPRESSED_EXT = '.mp3';

export class AudioConvertError extends Error {}

export type Compressor = (source: string) => string;

export function convertAudio(
  ffmpeg: string,
  source: string,
  target: string,
  compress: boolean,
  range?: { from: number; to: number },
): void {
  const args = [
    '-y',
    '-loglevel',
    'error',
    ...(range ? ['-ss', String(range.from), '-to', String(range.to)] : []),
    '-i',
    source,
    '-vn',
    '-ar',
    AUDIO_CONFIG.SAMPLE_RATE,
    '-ac',
    AUDIO_CONFIG.CHANNELS,
    ...(compress ? ['-b:a', COMPRESSED_BITRATE] : []),
    target,
  ];

  const result = spawnSync(ffmpeg, args, { encoding: Encoding.UTF8 });
  if (result.status !== 0) {
    if (fs.existsSync(target)) fs.rmSync(target);
    const detail = (result.stderr || '').trim().split('\n').pop() || 'unknown error';
    throw new AudioConvertError(`Could not convert ${path.basename(source)}: ${detail}`);
  }
}

export function requireFfmpeg(reason: string): string {
  const ffmpeg = resolveBinary(Cmd.FFMPEG);
  if (ffmpeg === null) {
    const dependency = DEPENDENCIES.find((d) => d.bin === Cmd.FFMPEG)!;
    throw new AudioConvertError(`${reason}\n${missingMessage(dependency)}`);
  }
  return ffmpeg;
}

export const compressForUpload: Compressor = (source) => {
  const ffmpeg = requireFfmpeg('Audio over 25 MB has to be compressed before it is sent.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-upload-'));
  const target = path.join(dir, `${path.parse(source).name}${COMPRESSED_EXT}`);
  convertAudio(ffmpeg, source, target, true);
  return target;
};
