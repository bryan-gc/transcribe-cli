import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export interface StatusField {
  label: string;
  value: string;
  tone?: 'value' | 'good' | 'warn' | 'bad' | 'dim';
}

interface HeaderProps {
  title: string;
  statusText: string;
  isBusy: boolean;
  fields: StatusField[];
}

const COLORS: Record<NonNullable<StatusField['tone']>, string | undefined> = {
  value: 'magenta',
  good: 'green',
  warn: 'yellow',
  bad: 'red',
  dim: undefined,
};

export function Header({ title, statusText, isBusy, fields }: HeaderProps) {
  const width = Math.max(...fields.map((f) => f.label.length), 0);

  return (
    <>
      <Text bold>{title}</Text>
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text>
          Status:{' '}
          <Text color="yellow">
            {isBusy && (
              <Text color="cyan">
                <Spinner type="dots" />{' '}
              </Text>
            )}
            {statusText}
          </Text>
        </Text>
        {fields.map((field) => (
          <Text key={field.label}>
            {`${field.label}:`.padEnd(width + 2)}
            <Text color={COLORS[field.tone ?? 'value']} dimColor={field.tone === 'dim'}>
              {field.value}
            </Text>
          </Text>
        ))}
      </Box>
    </>
  );
}
