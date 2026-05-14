import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  DEFAULT_LANGUAGE: process.env.DEFAULT_LANGUAGE || 'en',
};

export function validateConfig() {
  if (!config.OPENAI_API_KEY || config.OPENAI_API_KEY === 'tu_api_key_aqui') {
    throw new Error(
      'Missing OPENAI_API_KEY in the .env file. Please configure it before continuing.',
    );
  }
}
