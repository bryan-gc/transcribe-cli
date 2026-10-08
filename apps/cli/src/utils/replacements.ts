export const REPLACEMENT_ARROW = '=>';

export interface Replacement {
  from: string;
  to: string;
}

export function isReplacementLine(line: string): boolean {
  return line.includes(REPLACEMENT_ARROW);
}

export function parseReplacements(raw: string | undefined): Replacement[] {
  return (raw ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !line.startsWith('#') && isReplacementLine(line))
    .map((line) => {
      const index = line.indexOf(REPLACEMENT_ARROW);
      return {
        from: line.slice(0, index).trim(),
        to: line.slice(index + REPLACEMENT_ARROW.length).trim(),
      };
    })
    .filter((rule) => rule.from !== '' && rule.to !== '');
}

export function applyReplacements(
  text: string,
  rules: Replacement[],
): { text: string; count: number } {
  let count = 0;
  let result = text;
  for (const rule of rules) {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(rule.from)}(?![\\p{L}\\p{N}])`,
      'giu',
    );
    result = result.replace(pattern, () => {
      count++;
      return rule.to;
    });
  }
  return { text: result, count };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
