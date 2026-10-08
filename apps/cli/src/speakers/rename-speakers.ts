import fs from 'fs';
import type { DiarizedSegment } from '../transcriber/transcriber.js';
import { buildSrtFromDiarized, formatDiarized, parseDiarized } from '../utils/diarized-parser.js';
import { Encoding, EXT } from '../constants.js';

export const SPEAKERS_EXT = '.speakers.json';

export type SpeakerNames = Record<string, string>;

export interface SpeakerInfo {
  name: string;
  reference?: string;
  seconds?: number;
}

export function renameSegments(
  segments: DiarizedSegment[],
  names: SpeakerNames,
): DiarizedSegment[] {
  return segments.map((segment) => {
    const name = names[segment.speaker]?.trim();
    return name ? { ...segment, speaker: name } : segment;
  });
}

export function parseNameArgs(args: string[]): SpeakerNames {
  const names: SpeakerNames = {};
  for (const arg of args) {
    const index = arg.indexOf('=');
    if (index <= 0 || index === arg.length - 1) {
      throw new Error(`"${arg}" is not a rename. Use LABEL=Name, for example A=Ana.`);
    }
    names[arg.slice(0, index)] = arg.slice(index + 1);
  }
  return names;
}

export function transcriptStem(file: string): string {
  for (const ext of [SPEAKERS_EXT, EXT.META, EXT.DIARIZED, EXT.SUBTITLES, EXT.TEXT]) {
    if (file.endsWith(ext)) return file.slice(0, -ext.length);
  }
  return file.replace(/\.[^./]+$/, '');
}

export function readSpeakerSegments(stem: string): DiarizedSegment[] {
  const file = `${stem}${EXT.DIARIZED}`;
  if (!fs.existsSync(file)) {
    throw new Error(
      `No speaker data at ${file}. Only transcripts made with --speakers can be renamed.`,
    );
  }
  return parseDiarized(fs.readFileSync(file, Encoding.UTF8));
}

export function applySpeakerNames(stem: string, names: SpeakerNames): DiarizedSegment[] {
  const diarizedFile = `${stem}${EXT.DIARIZED}`;
  const renamed = renameSegments(readSpeakerSegments(stem), names);
  const raw = JSON.parse(fs.readFileSync(diarizedFile, Encoding.UTF8)) as Record<string, unknown>;

  fs.writeFileSync(diarizedFile, JSON.stringify({ ...raw, segments: renamed }), Encoding.UTF8);
  fs.writeFileSync(`${stem}${EXT.SUBTITLES}`, buildSrtFromDiarized(renamed), Encoding.UTF8);
  fs.writeFileSync(`${stem}${EXT.TEXT}`, formatDiarized(renamed), Encoding.UTF8);

  const infoFile = `${stem}${SPEAKERS_EXT}`;
  const info = fs.existsSync(infoFile)
    ? (JSON.parse(fs.readFileSync(infoFile, Encoding.UTF8)) as Record<string, SpeakerInfo>)
    : {};
  for (const [label, name] of Object.entries(names)) {
    if (name.trim()) info[label] = { ...info[label], name: name.trim() };
  }
  fs.writeFileSync(infoFile, `${JSON.stringify(info, null, 2)}\n`, Encoding.UTF8);
  return renamed;
}
