import type { DiarizedSegment } from '../transcriber/ITranscriber.js';
import { MIN_SUBTITLE_SEC, SUBTITLE_MAX_CHARS } from '../constants.js';

export function parseDiarized(raw: string): DiarizedSegment[] {
  const parsed = JSON.parse(raw) as { segments?: unknown };
  if (!Array.isArray(parsed.segments)) {
    throw new Error('Diarized response has no segments.');
  }
  return parsed.segments.map((s) => {
    const seg = s as Partial<DiarizedSegment>;
    return {
      speaker: String(seg.speaker ?? ''),
      start: Number(seg.start ?? 0),
      end: Number(seg.end ?? 0),
      text: String(seg.text ?? '').trim(),
    };
  });
}

const ANONYMOUS_LABEL = /^(\d+·)?[A-Z]$/;

export function speakerTag(speaker: string): string {
  return ANONYMOUS_LABEL.test(speaker) ? `Speaker ${speaker}` : speaker;
}

export function formatDiarized(segments: DiarizedSegment[]): string {
  const spoken = segments.filter((s) => s.text !== '');
  if (spoken.length === 0) return '';

  const text = (turn: DiarizedSegment[]) => turn.map((s) => s.text).join(' ');
  const turns = groupBySpeaker(spoken);
  if (new Set(spoken.map((s) => s.speaker)).size < 2) {
    return turns.map(text).join(' ');
  }
  return turns.map((turn) => `[${speakerTag(turn[0]!.speaker)}] ${text(turn)}`).join('\n');
}

export function buildSrtFromDiarized(segments: DiarizedSegment[]): string {
  const spoken = segments.filter((s) => s.text !== '');
  const multiSpeaker = new Set(spoken.map((s) => s.speaker)).size > 1;
  const cues: DiarizedSegment[] = [];

  for (const segment of spoken) {
    const open = cues[cues.length - 1];
    const fits =
      open !== undefined &&
      open.speaker === segment.speaker &&
      (open.end - open.start < MIN_SUBTITLE_SEC ||
        open.text.length + segment.text.length + 1 <= SUBTITLE_MAX_CHARS);

    if (fits) {
      open.text = `${open.text} ${segment.text}`;
      open.end = segment.end;
      continue;
    }
    cues.push({ ...segment });
  }

  return cues
    .map((cue, index) => {
      const label = multiSpeaker ? `[${speakerTag(cue.speaker)}] ` : '';
      return `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${label}${cue.text}\n`;
    })
    .join('\n');
}

function groupBySpeaker(segments: DiarizedSegment[]): DiarizedSegment[][] {
  const turns: DiarizedSegment[][] = [];
  for (const segment of segments) {
    const current = turns[turns.length - 1];
    if (current && current[0]!.speaker === segment.speaker) current.push(segment);
    else turns.push([segment]);
  }
  return turns;
}

export function srtTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}
