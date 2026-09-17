import path from 'path';
import type { DiarizedSegment } from '../transcriber/ITranscriber.js';
import { absorbShortFlips, pickReference, speakersByTalkTime } from './pickReference.js';

export const SAMPLE_MAX_CHARS = 60;

export interface SpeakerSummary {
  label: string;
  turns: number;
  seconds: number;
  sample: string;
}

export type ClipCutter = (source: string, target: string, from: number, to: number) => void;

export function summarizeSpeakers(segments: DiarizedSegment[]): SpeakerSummary[] {
  const cleaned = absorbShortFlips(segments);
  return speakersByTalkTime(cleaned).map((label) => {
    const own = cleaned.filter((s) => s.speaker === label);
    const turns = cleaned.filter(
      (s, i) => s.speaker === label && cleaned[i - 1]?.speaker !== label,
    ).length;
    const longest = [...own].sort((a, b) => b.text.length - a.text.length)[0];
    const text = longest?.text ?? '';
    return {
      label,
      turns,
      seconds: Math.round(own.reduce((sum, s) => sum + s.end - s.start, 0)),
      sample: text.length > SAMPLE_MAX_CHARS ? `${text.slice(0, SAMPLE_MAX_CHARS - 1)}…` : text,
    };
  });
}

export function cutSpeakerClips(
  audioPath: string,
  segments: DiarizedSegment[],
  dir: string,
  cut: ClipCutter,
): Record<string, string> {
  const cleaned = absorbShortFlips(segments);
  const clips: Record<string, string> = {};
  speakersByTalkTime(cleaned).forEach((label, index) => {
    const span = pickReference(cleaned, label);
    if (!span) return;
    const target = path.join(dir, `voice-${index + 1}.wav`);
    try {
      cut(audioPath, target, span.start, span.end);
      clips[label] = target;
    } catch {
      return;
    }
  });
  return clips;
}
