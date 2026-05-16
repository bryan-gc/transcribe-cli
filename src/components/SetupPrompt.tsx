import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { TextInput } from '@inkjs/ui';
import { ConfigManager, type AppConfig, DEFAULT_CONFIG } from '../config/configManager.js';

interface SetupPromptProps {
  initialConfig: AppConfig;
  onComplete: (config: AppConfig) => void;
}

export function SetupPrompt({ initialConfig, onComplete }: SetupPromptProps) {
  const [step, setStep] = useState<'API_KEY' | 'BASE_PATH'>('API_KEY');
  const [apiKey, setApiKey] = useState(initialConfig.apiKey);
  const basePath = initialConfig.basePath || DEFAULT_CONFIG.basePath;
  const [error, setError] = useState<string | null>(null);

  const handleSubmitApiKey = (value: string) => {
    if (!value.trim()) {
      setError('API Key is required.');
      return;
    }
    setApiKey(value.trim());
    setError(null);
    setStep('BASE_PATH');
  };

  const handleSubmitBasePath = (value: string) => {
    const p = value.trim();
    if (!p) {
      setError('Base Path is required.');
      return;
    }

    // Try to initialize it
    try {
      ConfigManager.initializeBasePath(p);
      const newConfig = { ...initialConfig, apiKey, basePath: p };
      ConfigManager.save(newConfig);
      onComplete(newConfig);
    } catch (e: unknown) {
      setError(`Invalid path: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        === Transcribe-CLI Setup ===
      </Text>

      {step === 'API_KEY' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Please enter your OpenAI API Key:</Text>
          <TextInput placeholder="sk-..." onSubmit={handleSubmitApiKey} />
          {error && <Text color="red">{error}</Text>}
        </Box>
      )}

      {step === 'BASE_PATH' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Enter the base path for audio and glossaries:</Text>
          <Text dimColor>(Press Enter to use default)</Text>
          <TextInput defaultValue={basePath} onSubmit={handleSubmitBasePath} />
          {error && <Text color="red">{error}</Text>}
        </Box>
      )}
    </Box>
  );
}
