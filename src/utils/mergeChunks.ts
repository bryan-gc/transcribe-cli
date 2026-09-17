import type { DiarizedSegment } from '../transcriber/ITranscriber.js';
import { srtTime } from './diarizedParser.js';

const TIMING = /^(\d+):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{3})/;

export interface SrtPart {
  srt: string;
  offsetSeconds: number;
}

export interface DiarizedPart {
  segments: DiarizedSegment[];
  offsetSeconds: number;
}

export function mergeSrt(parts: SrtPart[]): string {
  const cues: string[] = [];
  for (const part of parts) {
    for (const block of part.srt.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
      const lines = block.trim().split('\n');
      const timingIndex = lines.findIndex((line) => TIMING.test(line));
      if (timingIndex === -1) continue;
      const match = TIMING.exec(lines[timingIndex]!)!;
      const start = seconds(match.slice(1, 5)) + part.offsetSeconds;
      const end = seconds(match.slice(5, 9)) + part.offsetSeconds;
      const text = lines.slice(timingIndex + 1).join('\n');
      if (text.trim() === '') continue;
      cues.push(`${cues.length + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${text}\n`);
    }
  }
  return cues.join('\n');
}

export function mergeDiarized(
  parts: DiarizedPart[],
  options: { prefixSpeakers: boolean; knownNames?: Set<string> },
): DiarizedSegment[] {
  const prefix = options.prefixSpeakers && parts.length > 1;
  return parts.flatMap((part, index) =>
    part.segments.map((segment) => ({
      ...segment,
      speaker:
        prefix && !options.knownNames?.has(segment.speaker)
          ? `${index + 1}·${segment.speaker}`
          : segment.speaker,
      start: segment.start + part.offsetSeconds,
      end: segment.end + part.offsetSeconds,
    })),
  );
}

function seconds([h, m, s, ms]: string[]): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}
