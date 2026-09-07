#!/usr/bin/env node
import React, { useState } from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { App } from './components/App.js';
import { AutoRecordApp } from './components/AutoRecordApp.js';
import { ImportApp } from './components/ImportApp.js';
import { SetupPrompt } from './components/SetupPrompt.js';
import { ConfigManager, type AppConfig } from './config/configManager.js';
import {
  cliFlags,
  OptionError,
  resolveOptions,
  type ResolvedOptions,
} from './config/resolveOptions.js';
import { loadGlossaryFiles } from './utils/fileUtils.js';
import { AVAILABLE_LANGUAGES } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const program = new Command();

program
  .name('transcribe-cli')
  .description(pkg.description)
  .version(pkg.version, '-v, --version', 'Output the current version')
  .option('-m, --manual', 'Open the interactive manual menu')
  .option('-f, --file <path>', 'Transcribe an existing audio file instead of recording')
  .option('-l, --language <code>', `Language of the audio (${AVAILABLE_LANGUAGES.join(', ')})`)
  .option('-g, --glossary <name>', 'Glossary to use as context for this run')
  .option('--no-copy', 'Do not copy the result to the clipboard')
  .parse(process.argv);

const config = ConfigManager.load();
const needsSetup = !config.apiKey || !ConfigManager.validateBasePath(config.basePath);

let options: ResolvedOptions;
try {
  const glossaries = needsSetup ? [] : loadGlossaryFiles(config.basePath);
  const flags = cliFlags(program.opts(), (key) => program.getOptionValueSource(key));
  options = resolveOptions(flags, config, process.env, glossaries);
} catch (error) {
  if (!(error instanceof OptionError)) throw error;
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

if (!needsSetup) {
  ConfigManager.initializeBasePath(config.basePath);
}

function Root({ initialConfig, options }: { initialConfig: AppConfig; options: ResolvedOptions }) {
  const [appConfig, setAppConfig] = useState(initialConfig);
  const [pendingSetup, setPendingSetup] = useState(needsSetup);

  if (pendingSetup) {
    return (
      <SetupPrompt
        initialConfig={appConfig}
        onComplete={(c) => {
          setAppConfig(c);
          setPendingSetup(false);
        }}
      />
    );
  }

  const effective: AppConfig = {
    ...appConfig,
    selectedLanguage: options.language,
    autoCopy: options.copyToClipboard,
  };

  if (options.file) {
    return <ImportApp appConfig={effective} filePath={options.file} glossary={options.glossary} />;
  }
  return options.manual ? (
    <App appConfig={effective} />
  ) : (
    <AutoRecordApp appConfig={effective} glossary={options.glossary} />
  );
}

render(<Root initialConfig={config} options={options} />);
