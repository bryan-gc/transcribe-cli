#!/usr/bin/env node
import React, { useState } from 'react';
import { render } from 'ink';
import { Command, Option } from 'commander';
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
import { GlossaryReview } from './components/GlossaryReview.js';
import { openInEditor } from './system/editor.js';
import type { Candidate } from './glossary/extractTerms.js';
import type { ReviewDecision } from './glossary/applyReview.js';
import { runGlossaryCommand } from './glossary/glossaryCommand.js';
import { loadGlossaryFiles } from './utils/fileUtils.js';
import { needsSetup } from './transcriber/createTranscriber.js';
import { activeCapabilities, engineBlockers, formatReport, runChecks } from './system/doctor.js';
import { engineLabel } from './components/statusFields.js';
import { formatUsageReport, readUsage } from './utils/usageLog.js';
import { AVAILABLE_LANGUAGES } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const KNOWN_COMMANDS = ['doctor', 'usage', 'glossary'];

const program = new Command();

program
  .name('transcribe-cli')
  .description(pkg.description)
  .version(pkg.version, '-v, --version', 'Output the current version')
  .option('-c, --config', 'Open the configuration menu')
  .addOption(new Option('-m, --manual').hideHelp())
  .option('-f, --file <path>', 'Transcribe an existing audio file instead of recording')
  .option('-l, --language <code>', `Language of the audio (${AVAILABLE_LANGUAGES.join(', ')})`)
  .option('-g, --glossary <name>', 'Topic glossary to add to the general one (none: no glossary)')
  .option('--no-general-glossary', 'Leave the general glossary out of this run')
  .option('-s, --speakers', 'Detect and label who is speaking')
  .option('--name-speakers', 'With -f: label speakers, then name each voice after listening to it')
  .option('--local', 'Use the local WhisperX engine instead of the API')
  .option('--engine <name>', 'openai | local')
  .option('--all', 'With doctor: list every check · with usage: list every run')
  .argument(
    '[command]',
    'doctor — check the tools this setup needs · usage — what every transcription cost · glossary [edit|new|show] [name] — list and edit glossaries',
  )
  .allowExcessArguments()
  .option('--no-copy', 'Do not copy the result to the clipboard')
  .option('--no-wrap', 'Copy the bare text, without the automatic-transcription notice')
  .option('-y, --yes', 'Skip the cost confirmation shown for long audio files')
  .parse(process.argv);

const config = ConfigManager.load();

const command = program.args[0];
if (command !== undefined && !KNOWN_COMMANDS.includes(command)) {
  process.stderr.write(
    `Unknown command '${command}'. Available: ${KNOWN_COMMANDS.join(', ')}.\n` +
      'Run transcribe-cli --help to see every flag, or transcribe-cli -c for the settings menu.\n',
  );
  process.exit(1);
}

if (command === 'doctor') {
  const showAll = program.opts().all === true;
  const active = activeCapabilities(config, program.opts().file);
  const { text, failedInUse } = formatReport(runChecks(config, active), showAll);
  process.stdout.write(`transcribe-cli doctor\n${text}\n`);
  process.exit(failedInUse > 0 ? 1 : 0);
}
if (command === 'usage') {
  const report = formatUsageReport(readUsage(config.basePath), program.opts().all === true);
  process.stdout.write(`${report}\n`);
  process.exit(0);
}
if (command === 'glossary') {
  try {
    const useGeneral = program.opts().generalGlossary !== false && config.useGeneralGlossary;
    process.exit(
      await runGlossaryCommand(config.basePath, program.args.slice(1), useGeneral, {
        write: (text) => process.stdout.write(text),
        edit: (file) => openInEditor(file),
        review: process.stdout.isTTY ? reviewInTerminal : undefined,
      }),
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
async function reviewInTerminal(
  name: string,
  candidates: Candidate[],
): Promise<ReviewDecision[] | undefined> {
  let saved: ReviewDecision[] | undefined;
  const app = render(
    <GlossaryReview name={name} candidates={candidates} onSave={(d) => (saved = d)} />,
  );
  await app.waitUntilExit();
  return saved;
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
  const blockers = options.manual ? [] : engineBlockers({ ...config, engine: options.engine });
  if (blockers.length > 0) {
    const detail = blockers
      .map((check) => {
        const remedy = check.remedy ? `\n    ${check.remedy}` : '';
        return `  ✘ ${check.name}: ${check.detail}${remedy}`;
      })
      .join('\n');
    process.stderr.write(
      `Nothing was recorded: the ${engineLabel(options.engine)} engine is not ready.\n${detail}\n` +
        'Pick another engine with --engine, open transcribe-cli -c, or run transcribe-cli doctor.\n',
    );
    process.exit(1);
  }
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
    wrapClipboard: options.wrapClipboard,
    useGeneralGlossary: options.useGeneralGlossary,
    engine: options.engine,
  };

  if (options.file) {
    return (
      <ImportApp
        appConfig={effective}
        filePath={options.file}
        glossary={options.glossary}
        diarize={options.diarize}
        nameSpeakers={options.nameSpeakers}
        confirmLongAudio={options.confirmLongAudio}
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
