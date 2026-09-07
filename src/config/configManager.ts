import fs from 'fs';
import path from 'path';
import os from 'os';
import { DIR, EXT, LanguageCode, LEGACY_DATA_DIR, RecordingKind } from '../constants.js';

export enum Engine {
  OPENAI = 'openai',
  LOCAL = 'local',
}

export interface LocalWhisperConfig {
  /** The whisperx executable; scripts/install-whisperx.sh puts one at the default path. */
  binPath: string;
  model: string;
  device: string;
  computeType: string;
}

export interface AppConfig {
  apiKey: string;
  basePath: string;
  selectedMicrophone: string;
  /** Microphone ids in order of preference; the first one connected is used. */
  microphonePriority: string[];
  selectedLanguage: LanguageCode;
  autoCopy: boolean;
  engine: Engine;
  localWhisper: LocalWhisperConfig;
}

const CONFIG_DIR = path.join(os.homedir(), '.transcribe-cli');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  basePath: path.join(os.homedir(), 'transcribe_cli_data'),
  selectedMicrophone: 'default',
  microphonePriority: [],
  selectedLanguage: LanguageCode.ENGLISH,
  autoCopy: false,
  engine: Engine.OPENAI,
  localWhisper: {
    binPath: path.join(CONFIG_DIR, 'venv-whisperx', 'bin', 'whisperx'),
    // large-v3 in float16 needs most of a 6 GB card, leaving no room to spare; turbo is the
    // better default and int8 is the way out if a smaller card runs out of memory.
    model: 'large-v3-turbo',
    device: 'cuda',
    computeType: 'float16',
  },
};

export class ConfigManager {
  static load(): AppConfig {
    if (!fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG };
    }
    try {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      // Spreading is shallow, so a partial localWhisper in the file would blank the rest of it.
      const config = {
        ...DEFAULT_CONFIG,
        ...parsed,
        localWhisper: { ...DEFAULT_CONFIG.localWhisper, ...(parsed.localWhisper ?? {}) },
      };

      // A configuration written before the list existed carries the single microphone it chose,
      // which becomes a list of one and keeps behaving the same way.
      if (config.microphonePriority.length === 0 && config.selectedMicrophone) {
        config.microphonePriority = [config.selectedMicrophone];
      }
      return config;
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  static save(config: AppConfig): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    // The file holds an API key, and `mode` above only applies when the file is created.
    // Existing configs written before this keep their old permissions without an explicit chmod.
    fs.chmodSync(CONFIG_PATH, 0o600);
  }

  static validateBasePath(basePath: string): boolean {
    if (!basePath) return false;
    return fs.existsSync(basePath) && fs.statSync(basePath).isDirectory();
  }

  static initializeBasePath(basePath: string): void {
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
    }

    ConfigManager.migrateLegacyLayout(basePath);

    const dirs = [
      path.join(basePath, DIR.DATA, RecordingKind.RECORDED),
      path.join(basePath, DIR.DATA, RecordingKind.IMPORTED),
      path.join(basePath, DIR.GLOSSARIES),
      path.join(basePath, DIR.CACHE),
    ];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Moves an installation created before the rename into the current layout, once.
   *
   * The old `tmp/` held the entire archive despite the name. Everything in it was recorded by the
   * app itself, so it becomes `transcriptions/recorded/`, and the microphone test moves to the
   * cache. Entries are renamed rather than copied: both paths are under the same base path, so
   * this is a pointer update no matter how large the archive is.
   *
   * Nothing is deleted that could not be moved, and the presence of the target makes it a no-op on
   * every later run, so a `tmp/` the user creates afterwards is left alone.
   */
  static migrateLegacyLayout(basePath: string): void {
    const legacy = path.join(basePath, LEGACY_DATA_DIR);
    const target = path.join(basePath, DIR.DATA, RecordingKind.RECORDED);
    if (!fs.existsSync(legacy) || !fs.statSync(legacy).isDirectory()) return;
    if (fs.existsSync(target)) return;

    const cache = path.join(basePath, DIR.CACHE);
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(cache, { recursive: true });

    const testFile = `mic-test${EXT.AUDIO}`;
    for (const entry of fs.readdirSync(legacy)) {
      const from = path.join(legacy, entry);
      const to = entry === testFile ? path.join(cache, entry) : path.join(target, entry);
      if (fs.existsSync(to)) continue;
      fs.renameSync(from, to);
    }

    if (fs.readdirSync(legacy).length === 0) fs.rmdirSync(legacy);
  }
}
