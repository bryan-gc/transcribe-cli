import type { TestContext } from 'node:test';
import { OpenAIStub } from './openai-stub.js';
import { Sandbox, type SandboxOptions } from './sandbox.js';

export interface Harness {
  sandbox: Sandbox;
  api: OpenAIStub;
  env: Record<string, string | undefined>;
}

export async function harness(t: TestContext, options: SandboxOptions = {}): Promise<Harness> {
  const sandbox = new Sandbox({
    ...options,
    config: { autoGlossary: 'off', askMetaBackfill: false, ...options.config },
  });
  const api = await new OpenAIStub().start();
  t.after(async () => {
    await api.stop();
    sandbox.remove();
  });
  return { sandbox, api, env: api.env() };
}

export function glossary(sandbox: Sandbox, name: string, lines: string[]): string {
  return sandbox.write(sandbox.dataFile('glossaries', `${name}.txt`), `${lines.join('\n')}\n`);
}
