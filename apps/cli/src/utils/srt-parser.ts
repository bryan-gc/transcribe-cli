/**
 * Extracts the raw spoken text from an SRT file, joining all subtitle
 * segments into a single continuous paragraph separated by spaces.
 */
export function extractTextFromSrt(srtContent: string): string {
  if (!srtContent) return '';

  const lines = srtContent.split(/\r?\n/);
  const textLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip subtitle index numbers
    if (/^\d+$/.test(trimmed)) continue;
    // Skip timestamp lines (e.g. 00:00:00,000 --> 00:00:02,000)
    if (trimmed.includes('-->')) continue;

    textLines.push(trimmed);
  }

  // Join as one paragraph — segments are separated by a single space
  return textLines.join(' ');
}
