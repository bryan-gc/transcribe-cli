#!/usr/bin/env node
import React, { useState, useEffect } from 'react';
import { render, Box, Text } from 'ink';
import { App } from './components/App.js';
import { SetupPrompt } from './components/SetupPrompt.js';
import { ConfigManager, type AppConfig } from './config/configManager.js';

function Root() {
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

  return <App appConfig={config} />;
}

render(<Root />);
