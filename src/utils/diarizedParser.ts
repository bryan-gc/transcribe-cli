import type { DiarizedSegment } from '../transcriber/ITranscriber.js';
import { MIN_SUBTITLE_SEC, SUBTITLE_MAX_CHARS } from '../constants.js';

/**
 * Reads the segment list out of a diarized response.
 *
 * Times arrive as seconds in floating point and speakers as bare letters, so nothing is rescaled
 * or renamed here: the prefix is the display layer's business.
 */
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

/**
 * Renders the transcription as speaker turns.
 *
 * Consecutive segments from one speaker are joined: the model returns very short pieces — three
 * characters over half a second is normal — and one line each is unreadable. A recording with a
 * single speaker gets no labels at all, since prefixing every line with the same name is noise,
 * and that is the common case for a recording made from one microphone.
 */
export function formatDiarized(segments: DiarizedSegment[]): string {
  const spoken = segments.filter((s) => s.text !== '');
  if (spoken.length === 0) return '';

  const text = (turn: DiarizedSegment[]) => turn.map((s) => s.text).join(' ');
  const turns = groupBySpeaker(spoken);
  if (new Set(spoken.map((s) => s.speaker)).size < 2) {
    return turns.map(text).join(' ');
  }
  return turns.map((turn) => `[Speaker ${turn[0]!.speaker}] ${text(turn)}`).join('\n');
}

/**
 * Builds subtitles from the same segments.
 *
 * Merging is needed here too, but for a different reason and with a different limit: a subtitle of
 * a third of a second flashes past unread. Segments are joined while they stay under a readable
 * length, and never across a change of speaker — a brief subtitle is a smaller loss than
 * attributing words to the wrong person.
 */
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
      const label = multiSpeaker ? `[Speaker ${cue.speaker}] ` : '';
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

/** SRT wants HH:MM:SS,mmm — a comma before the milliseconds, not the point most formatters emit. */
function srtTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}
