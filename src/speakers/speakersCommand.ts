import fs from 'fs';
import type { DiarizedSegment } from '../transcriber/ITranscriber.js';
import path from 'path';
import {
  applySpeakerNames,
  parseNameArgs,
  readSpeakerSegments,
  transcriptStem,
  type SpeakerNames,
} from './renameSpeakers.js';
import { summarizeSpeakers, type SpeakerSummary } from './speakerSummary.js';
import { speakerTag } from '../utils/diarizedParser.js';
import { SUPPORTED_IMPORT_EXT } from '../constants.js';

export interface SpeakersCommandDeps {
  write: (text: string) => void;
  name?: (
    speakers: SpeakerSummary[],
    segments: DiarizedSegment[],
    audioPath: string | undefined,
  ) => Promise<SpeakerNames | undefined>;
}

export function findAudioFor(stem: string): string | undefined {
  return [...SUPPORTED_IMPORT_EXT]
    .map((ext) => `${stem}${ext}`)
    .find((file) => fs.existsSync(file));
}

export function formatSpeakerList(speakers: SpeakerSummary[]): string {
  return speakers
    .map(
      (s) => `  ${speakerTag(s.label).padEnd(14)} ${s.turns} turns · ${s.seconds}s  "${s.sample}"`,
    )
    .join('\n');
}

export async function runSpeakersCommand(
  args: string[],
  deps: SpeakersCommandDeps,
): Promise<number> {
  const [target, ...renames] = args;
  if (!target) {
    throw new Error('Usage: transcribe-cli speakers <transcript file> [A=Name B=Name…]');
  }
  const stem = transcriptStem(path.resolve(target));
  const segments = readSpeakerSegments(stem);

  if (renames.length > 0) {
    applySpeakerNames(stem, parseNameArgs(renames));
    deps.write(
      `Renamed. Speakers now:\n${formatSpeakerList(summarizeSpeakers(readSpeakerSegments(stem)))}\n`,
    );
    return 0;
  }

  const speakers = summarizeSpeakers(segments);
  if (!deps.name) {
    deps.write(
      `${formatSpeakerList(speakers)}\nRename with: transcribe-cli speakers ${target} A=Name B=Name\n`,
    );
    return 0;
  }
  const names = await deps.name(speakers, segments, findAudioFor(stem));
  if (!names || !Object.values(names).some(Boolean)) {
    deps.write('Nothing changed.\n');
    return 0;
  }
  applySpeakerNames(stem, names);
  deps.write('Speakers named and saved.\n');
  return 0;
}
