import type { DiarizedSegment } from '../transcriber/transcriber.js';

export const REFERENCE_MIN_SECONDS = 3;
export const REFERENCE_MAX_SECONDS = 10;
export const OVERLAP_GUARD_SECONDS = 0.5;
export const SHORT_FLIP_SECONDS = 1;

export interface ReferenceSpan {
  speaker: string;
  start: number;
  end: number;
}

export function pickReference(
  segments: DiarizedSegment[],
  speaker: string,
): ReferenceSpan | undefined {
  const spans = mergeConsecutive(segments).filter((span) => span.speaker === speaker);
  const long = spans
    .filter((span) => !overlapsOtherSpeaker(segments, span))
    .map((span) => trimNearOtherSpeaker(segments, span))
    .filter((span) => span.end - span.start >= REFERENCE_MIN_SECONDS)
    .sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  if (!long) return undefined;
  return { ...long, end: Math.min(long.end, long.start + REFERENCE_MAX_SECONDS) };
}

export function speakersByTalkTime(segments: DiarizedSegment[]): string[] {
  const talk = new Map<string, number>();
  for (const s of segments) talk.set(s.speaker, (talk.get(s.speaker) ?? 0) + s.end - s.start);
  return [...talk.entries()].sort((a, b) => b[1] - a[1]).map(([speaker]) => speaker);
}

export function absorbShortFlips(segments: DiarizedSegment[]): DiarizedSegment[] {
  return segments.map((segment, i) => {
    const before = segments[i - 1];
    const after = segments[i + 1];
    const short = segment.end - segment.start < SHORT_FLIP_SECONDS;
    if (
      short &&
      before &&
      after &&
      before.speaker === after.speaker &&
      before.speaker !== segment.speaker
    ) {
      return { ...segment, speaker: before.speaker };
    }
    return segment;
  });
}

function mergeConsecutive(segments: DiarizedSegment[]): ReferenceSpan[] {
  const spans: ReferenceSpan[] = [];
  for (const s of segments) {
    const last = spans.at(-1);
    if (last && last.speaker === s.speaker && s.start - last.end <= OVERLAP_GUARD_SECONDS) {
      last.end = Math.max(last.end, s.end);
    } else {
      spans.push({ speaker: s.speaker, start: s.start, end: s.end });
    }
  }
  return spans;
}

function overlapsOtherSpeaker(segments: DiarizedSegment[], span: ReferenceSpan): boolean {
  return segments.some(
    (s) => s.speaker !== span.speaker && s.start < span.end && s.end > span.start,
  );
}

function trimNearOtherSpeaker(segments: DiarizedSegment[], span: ReferenceSpan): ReferenceSpan {
  const others = segments.filter((s) => s.speaker !== span.speaker);
  const endsJustBefore = others.some(
    (s) => s.end <= span.start && span.start - s.end < OVERLAP_GUARD_SECONDS,
  );
  const startsJustAfter = others.some(
    (s) => s.start >= span.end && s.start - span.end < OVERLAP_GUARD_SECONDS,
  );
  return {
    ...span,
    start: endsJustBefore ? span.start + OVERLAP_GUARD_SECONDS : span.start,
    end: startsJustAfter ? span.end - OVERLAP_GUARD_SECONDS : span.end,
  };
}
