import path from 'path';
import { COMPRESSED_EXT, convertAudio } from './compress.js';

export interface AudioChunk {
  index: number;
  path: string;
  offsetSeconds: number;
  durationSeconds: number;
}

export type RangeConverter = (
  ffmpeg: string,
  source: string,
  target: string,
  compress: boolean,
  range: { from: number; to: number },
) => void;

export function chunkFileName(index: number): string {
  return `part-${String(index).padStart(3, '0')}${COMPRESSED_EXT}`;
}

export function chunkRanges(cuts: number[], totalSeconds: number): { from: number; to: number }[] {
  const edges = [0, ...cuts, totalSeconds];
  return edges.slice(1).map((to, i) => ({ from: edges[i]!, to }));
}

export function splitAudio(
  ffmpeg: string,
  file: string,
  cuts: number[],
  totalSeconds: number,
  dir: string,
  convert: RangeConverter = convertAudio,
): AudioChunk[] {
  return chunkRanges(cuts, totalSeconds).map((range, index) => {
    const target = path.join(dir, chunkFileName(index));
    convert(ffmpeg, file, target, true, range);
    return {
      index,
      path: target,
      offsetSeconds: range.from,
      durationSeconds: range.to - range.from,
    };
  });
}
