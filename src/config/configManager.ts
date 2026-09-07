import fs from 'fs';
import path from 'path';
import os from 'os';
import { DIR, EXT, LanguageCode, LEGACY_DATA_DIR, RecordingKind } from '../constants.js';

export interface AppConfig {
  apiKey: string;
  basePath: string;
  selectedMicrophone: string;
  selectedLanguage: LanguageCode;
  autoCopy: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), '.transcribe-cli');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  basePath: path.join(os.homedir(), 'transcribe_cli_data'),
  selectedMicrophone: 'default',
  selectedLanguage: LanguageCode.ENGLISH,
  autoCopy: false,
};

export class ConfigManager {
  static load(): AppConfig {
    if (!fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG };
    }
    try {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      return { ...DEFAULT_CONFIG, ...parsed };
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
