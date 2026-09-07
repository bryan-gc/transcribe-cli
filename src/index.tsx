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
import { needsSetup } from './transcriber/createTranscriber.js';
import { activeCapabilities, formatReport, runChecks } from './system/doctor.js';
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
  .option('-s, --speakers', 'Detect and label who is speaking')
  .option('--local', 'Use the local WhisperX engine instead of the API')
  .option('--engine <name>', 'openai | local')
  .option('--all', 'With doctor: list every check, not just the ones in use')
  .argument('[command]', 'doctor — check the tools this setup needs')
  .option('--no-copy', 'Do not copy the result to the clipboard')
  .parse(process.argv);

const config = ConfigManager.load();

if (program.args[0] === 'doctor') {
  const showAll = program.opts().all === true;
  const active = activeCapabilities(config, program.opts().file);
  const { text, failedInUse } = formatReport(runChecks(config, active), showAll);
  process.stdout.write(`transcribe-cli doctor\n${text}\n`);
  process.exit(failedInUse > 0 ? 1 : 0);
}
const basePathReady = ConfigManager.validateBasePath(config.basePath);

let options: ResolvedOptions;
try {
  const glossaries = basePathReady ? loadGlossaryFiles(config.basePath) : [];
  const flags = cliFlags(program.opts(), (key) => program.getOptionValueSource(key));
  options = resolveOptions(flags, config, process.env, glossaries);
} catch (error) {
  if (!(error instanceof OptionError)) throw error;
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

const setupRequired = needsSetup({ ...config, engine: options.engine });

if (!setupRequired) {
  ConfigManager.initializeBasePath(config.basePath);
}

function Root({ initialConfig, options }: { initialConfig: AppConfig; options: ResolvedOptions }) {
  const [appConfig, setAppConfig] = useState(initialConfig);
  const [pendingSetup, setPendingSetup] = useState(setupRequired);

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
    engine: options.engine,
  };

  if (options.file) {
    return (
      <ImportApp
        appConfig={effective}
        filePath={options.file}
        glossary={options.glossary}
        diarize={options.diarize}
      />
    );
  }
  return options.manual ? (
    <App appConfig={effective} />
  ) : (
    <AutoRecordApp appConfig={effective} glossary={options.glossary} diarize={options.diarize} />
  );
}

render(<Root initialConfig={config} options={options} />);
