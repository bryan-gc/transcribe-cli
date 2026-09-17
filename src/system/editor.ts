import { spawn } from 'child_process';
import { resolveBinary } from './dependencies.js';
import { ProcessEvent } from '../constants.js';

export const FALLBACK_EDITORS = ['nano', 'vi'] as const;

export type BinaryLookup = (bin: string) => string | null;

export class EditorError extends Error {}

export function resolveEditor(
  env: NodeJS.ProcessEnv = process.env,
  lookup: BinaryLookup = (bin) => resolveBinary(bin, { env }),
): string[] | null {
  for (const configured of [env.VISUAL, env.EDITOR]) {
    const parts = configured?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (parts.length > 0) return parts;
  }
  for (const editor of FALLBACK_EDITORS) {
    const found = lookup(editor);
    if (found) return [found];
  }
  return null;
}

export function openInEditor(
  file: string,
  env: NodeJS.ProcessEnv = process.env,
  lookup?: BinaryLookup,
): Promise<number> {
  const command = resolveEditor(env, lookup);
  if (!command) {
    return Promise.reject(
      new EditorError(
        `No editor found. Set one, for example: export EDITOR=nano\nOr open the file yourself: ${file}`,
      ),
    );
  }
  const [cmd, ...args] = command;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd!, [...args, file], { stdio: 'inherit' });
    child.on(ProcessEvent.ERROR, (error) =>
      reject(new EditorError(`Could not start ${cmd}: ${error.message}`)),
    );
    child.on(ProcessEvent.CLOSE, (code) => resolve(code ?? 0));
  });
}
