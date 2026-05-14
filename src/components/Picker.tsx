import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Select } from '@inkjs/ui';
import { BACK_OPTION_VALUE } from '../constants.js';

interface PickerOption {
  label: string;
  value: string;
}

interface PickerProps {
  title: string;
  options: PickerOption[];
  onSelect: (value: string) => void;
  onCancel: () => void;
}

export function Picker({ title, options, onSelect, onCancel }: PickerProps) {
  useInput((input, key) => {
    if (key.escape || input.toLowerCase() === 'q') {
      onCancel();
    }
  });

  const allOptions: PickerOption[] = [{ label: '← Back', value: BACK_OPTION_VALUE }, ...options];

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        --- {title} ---
      </Text>
      <Box marginTop={1} marginBottom={1}>
        <Select
          options={allOptions}
          onChange={(value) => {
            if (value === BACK_OPTION_VALUE) {
              onCancel();
              return;
            }
            onSelect(value);
          }}
        />
      </Box>
      <Text dimColor>↑↓ navigate · Enter confirm · Esc/q cancel</Text>
    </Box>
  );
}
