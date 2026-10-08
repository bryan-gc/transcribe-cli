import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const SYSTEM_TOOLS = ['ffmpeg', 'ffprobe'] as const;

export interface SandboxOptions {
  tools?: readonly string[];
  config?: Record<string, unknown>;
}

export class Sandbox {
  readonly root: string;
  readonly home: string;
  readonly data: string;
  readonly bin: string;
  readonly clipboardFile: string;
  readonly logDir: string;

  constructor(options: SandboxOptions = {}) {
    this.root = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-cli-test-'));
    this.home = path.join(this.root, 'home');
    this.data = path.join(this.root, 'data');
    this.bin = path.join(this.root, 'bin');
    this.clipboardFile = path.join(this.root, 'clipboard.txt');
    this.logDir = path.join(this.root, 'calls');
    for (const dir of [this.home, this.bin, this.logDir]) fs.mkdirSync(dir, { recursive: true });
    for (const tool of options.tools ?? SYSTEM_TOOLS) this.linkSystemTool(tool);
    if (options.config) this.writeConfig(options.config);
  }

  get configPath(): string {
    return path.join(this.home, '.transcribe-cli', 'config.json');
  }

  env(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
    return {
      HOME: this.home,
      PATH: this.bin,
      LANG: 'C.UTF-8',
      TERM: 'xterm-256color',
      NO_COLOR: '1',
      TRANSCRIBE_BASE_PATH: this.data,
      OPENAI_API_KEY: 'sk-test-key',
      ...extra,
    };
  }

  writeConfig(config: Record<string, unknown>): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  readConfig(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(this.configPath, 'utf8')) as Record<string, unknown>;
  }

  linkSystemTool(tool: string): void {
    const found = execFileSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).trim();
    fs.symlinkSync(found, path.join(this.bin, tool));
  }

  stub(name: string, script: string): string {
    return this.executable(path.join(this.bin, name), script);
  }

  executable(target: string, script = 'exit 0'): string {
    const file = path.isAbsolute(target) ? target : path.join(this.root, target);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `#!/bin/bash\nPATH=/usr/bin:/bin\n${script}\n`, { mode: 0o755 });
    return file;
  }

  stubClipboard(name: 'xclip' | 'xsel' = 'xclip'): void {
    this.stub(
      name,
      `printf '%s\\n' "$*" > '${this.logDir}/${name}.args'\ncat > '${this.clipboardFile}'`,
    );
  }

  clipboard(): string | undefined {
    return fs.existsSync(this.clipboardFile)
      ? fs.readFileSync(this.clipboardFile, 'utf8')
      : undefined;
  }

  callArgs(name: string): string | undefined {
    const file = path.join(this.logDir, `${name}.args`);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : undefined;
  }

  file(...parts: string[]): string {
    return path.join(this.root, ...parts);
  }

  dataFile(...parts: string[]): string {
    return path.join(this.data, ...parts);
  }

  write(relative: string, content: string | Buffer): string {
    const target = path.isAbsolute(relative) ? relative : path.join(this.root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
  }

  read(file: string): string {
    return fs.readFileSync(file, 'utf8');
  }

  transcripts(kind: 'recorded' | 'imported'): string[] {
    const dir = path.join(this.data, 'transcriptions', kind);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .map((entry) => path.join(dir, entry))
      .filter((entry) => fs.statSync(entry).isFile())
      .toSorted((a, b) => a.localeCompare(b));
  }

  transcriptFile(kind: 'recorded' | 'imported', extension: string): string {
    const found = this.transcripts(kind).filter((file) => file.endsWith(extension));
    if (found.length !== 1) {
      throw new Error(`Expected one ${extension} in ${kind}, found ${found.length}`);
    }
    return found[0]!;
  }

  meta(kind: 'recorded' | 'imported'): Record<string, unknown> {
    return JSON.parse(this.read(this.transcriptFile(kind, '.meta.json'))) as Record<
      string,
      unknown
    >;
  }

  usageLines(): Record<string, unknown>[] {
    const file = this.dataFile('usage.jsonl');
    if (!fs.existsSync(file)) return [];
    return this.read(file)
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  remove(): void {
    fs.rmSync(this.root, { recursive: true, force: true });
  }
}
