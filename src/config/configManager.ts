import fs from 'fs';
import path from 'path';
import os from 'os';
import { LanguageCode } from '../constants.js';

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
    const tmpDir = path.join(basePath, 'tmp');
    const glossariesDir = path.join(basePath, 'glossaries');

    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    if (!fs.existsSync(glossariesDir)) fs.mkdirSync(glossariesDir, { recursive: true });
  }
}
