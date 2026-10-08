import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import type { Sandbox } from './sandbox.js';

const APP_DIR = path.resolve(import.meta.dirname, '..', '..');
const ENTRY = path.join(APP_DIR, 'src', 'index.tsx');
const DEFAULT_DEADLINE_MS = 20_000;

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  screen: string;
}

export interface RunOptions {
  env?: Record<string, string | undefined>;
  input?: string;
  deadlineMs?: number;
}

function nodeArgs(args: string[]): string[] {
  return ['--import', 'tsx', ENTRY, ...args];
}

export function runCli(
  sandbox: Sandbox,
  args: string[],
  options: RunOptions = {},
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, nodeArgs(args), {
      cwd: APP_DIR,
      env: sandbox.env(options.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`transcribe-cli ${args.join(' ')} did not finish.\n${stdout}\n${stderr}`));
    }, options.deadlineMs ?? DEFAULT_DEADLINE_MS);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      const plain = stripVTControlCharacters(stdout);
      resolve({ code: code ?? -1, stdout: plain, stderr, screen: plain.replaceAll(/\s+/g, ' ') });
    });
    child.stdin.end(options.input ?? '');
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export const Key = {
  ENTER: '\r',
  ESCAPE: '\u001B',
  SPACE: ' ',
  UP: '\u001B[A',
  DOWN: '\u001B[B',
  RIGHT: '\u001B[C',
  LEFT: '\u001B[D',
  BACKSPACE: '\u007F',
  PAGE_UP: '\u001B[5~',
  PAGE_DOWN: '\u001B[6~',
  CTRL_C: '\u0003',
} as const;

export class TerminalSession {
  private readonly child: ChildProcess;
  private output = '';
  private readonly listeners = new Set<() => void>();
  private readonly closed: Promise<number>;

  constructor(sandbox: Sandbox, args: string[], env: Record<string, string | undefined> = {}) {
    const appEnv = sandbox.env(env);
    const command = [process.execPath, ...nodeArgs(args)].map(shellQuote).join(' ');
    const shell = `stty cols 160 rows 60; PATH=${shellQuote(appEnv.PATH ?? '')} exec ${command}`;
    this.child = spawn('script', ['-qfec', shell, '/dev/null'], {
      cwd: APP_DIR,
      env: { ...appEnv, PATH: '/usr/bin:/bin' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const collect = (chunk: Buffer) => {
      this.output += chunk.toString();
      for (const listener of this.listeners) listener();
    };
    this.child.stdout?.on('data', collect);
    this.child.stderr?.on('data', collect);
    this.closed = new Promise((resolve) => {
      this.child.on('close', (code) => {
        for (const listener of this.listeners) listener();
        resolve(code ?? -1);
      });
    });
  }

  get text(): string {
    return stripVTControlCharacters(this.output);
  }

  mark(): number {
    return this.text.length;
  }

  since(mark: number): string {
    return this.text.slice(mark);
  }

  waitFor(
    expected: string | RegExp,
    options: { from?: number; deadlineMs?: number } = {},
  ): Promise<string> {
    const from = options.from ?? 0;
    const matches = () => {
      const seen = this.text.slice(from);
      return typeof expected === 'string' ? seen.includes(expected) : expected.test(seen);
    };
    if (matches()) return Promise.resolve(this.text.slice(from));
    return new Promise((resolve, reject) => {
      const check = () => {
        if (!matches()) return;
        this.listeners.delete(check);
        clearTimeout(timer);
        resolve(this.text.slice(from));
      };
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(
          new Error(
            `Never saw ${String(expected)} on screen. Last output:\n${this.text.slice(-3000)}`,
          ),
        );
      }, options.deadlineMs ?? DEFAULT_DEADLINE_MS);
      this.listeners.add(check);
    });
  }

  async press(...keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.keyboardReady();
      const before = this.output.length;
      this.child.stdin?.write(key);
      await this.rendered(before);
    }
  }

  answer(line: string): void {
    this.child.stdin?.write(`${line}\r`);
  }

  async send(key: string): Promise<void> {
    await this.keyboardReady();
    this.child.stdin?.write(key);
  }

  private terminal(): string | undefined {
    try {
      const pid = execFileSync('pgrep', ['-P', String(this.child.pid)], { encoding: 'utf8' })
        .trim()
        .split('\n')[0];
      return fs.readlinkSync(`/proc/${pid}/fd/0`);
    } catch {
      return undefined;
    }
  }

  private isRaw(): boolean {
    const tty = this.terminal();
    if (!tty?.startsWith('/dev/pts/')) return false;
    try {
      return execFileSync('stty', ['-F', tty], { encoding: 'utf8' }).includes('-icanon');
    } catch {
      return false;
    }
  }

  private async keyboardReady(): Promise<void> {
    const deadline = Date.now() + DEFAULT_DEADLINE_MS;
    while (!this.isRaw()) {
      if (Date.now() > deadline)
        throw new Error(`The app never took the keyboard. Last output:\n${this.text.slice(-2000)}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  private rendered(before: number): Promise<void> {
    if (this.output.length > before) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.output.length <= before) return;
        this.listeners.delete(check);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(
          new Error(
            `The screen did not change after a key press. Last output:\n${this.text.slice(-2000)}`,
          ),
        );
      }, DEFAULT_DEADLINE_MS);
      this.listeners.add(check);
    });
  }

  type(text: string): Promise<void> {
    return this.press(text);
  }

  get exited(): Promise<number> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<number>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`The app did not exit. Last output:\n${this.text.slice(-2000)}`)),
        DEFAULT_DEADLINE_MS,
      );
    });
    return Promise.race([this.closed, deadline]).finally(() => clearTimeout(timer));
  }

  kill(): void {
    this.child.kill('SIGKILL');
  }
}

export function startCli(
  sandbox: Sandbox,
  args: string[],
  env: Record<string, string | undefined> = {},
): TerminalSession {
  return new TerminalSession(sandbox, args, env);
}

export async function until(
  check: () => boolean,
  what: string,
  deadlineMs = DEFAULT_DEADLINE_MS,
): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Never happened: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
