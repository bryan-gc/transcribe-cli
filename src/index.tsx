#!/usr/bin/env node
import React, { useState, useEffect } from 'react';
import { render, Box, Text } from 'ink';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { App } from './components/App.js';
import { AutoRecordApp } from './components/AutoRecordApp.js';
import { SetupPrompt } from './components/SetupPrompt.js';
import { ConfigManager, type AppConfig } from './config/configManager.js';

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
  .parse(process.argv);

const options = program.opts();
const isManualMode = Boolean(options.manual);

function Root({ manualMode }: { manualMode: boolean }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    const loadedConfig = ConfigManager.load();
    if (!loadedConfig.apiKey || !ConfigManager.validateBasePath(loadedConfig.basePath)) {
      setNeedsSetup(true);
      setConfig(loadedConfig);
    } else {
      ConfigManager.initializeBasePath(loadedConfig.basePath);
      setConfig(loadedConfig);
    }
  }, []);

  if (!config) {
    return (
      <Box padding={1}>
        <Text>Loading configuration...</Text>
      </Box>
    );
  }

  if (needsSetup) {
    return (
      <SetupPrompt
        initialConfig={config}
        onComplete={(c) => {
          setConfig(c);
          setNeedsSetup(false);
        }}
      />
    );
  }

  return manualMode ? <App appConfig={config} /> : <AutoRecordApp appConfig={config} />;
}

render(<Root manualMode={isManualMode} />);
