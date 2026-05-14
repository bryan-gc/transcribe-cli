import React from 'react';
import { render } from 'ink';
import { App } from './components/App.js';
import { validateConfig } from './config/env.js';

try {
  validateConfig();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\x1b[31m%s\x1b[0m', message);
  process.exit(1);
}

render(<App />);
