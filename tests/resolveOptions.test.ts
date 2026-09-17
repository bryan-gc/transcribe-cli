import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOptions, cliFlags, OptionError, ENV_KEYS } from '../src/config/resolveOptions.js';
import { DEFAULT_CONFIG, Engine, type AppConfig } from '../src/config/configManager.js';
import { LanguageCode } from '../src/constants.js';

const config = (over: Partial<AppConfig> = {}): AppConfig => ({ ...DEFAULT_CONFIG, ...over });
const GLOSSARIES = ['devops.txt', 'medicina.txt'];

test('with nothing set, the saved configuration wins over the built-in default', () => {
  const o = resolveOptions({}, config({ selectedLanguage: LanguageCode.SPANISH }), {});
  assert.equal(o.language, LanguageCode.SPANISH);
});

test('the environment overrides the saved configuration', () => {
  const o = resolveOptions({}, config({ selectedLanguage: LanguageCode.SPANISH }), {
    [ENV_KEYS.LANGUAGE]: 'pt',
  });
  assert.equal(o.language, LanguageCode.PORTUGUESE);
});

test('the flag overrides the environment', () => {
  const o = resolveOptions({ language: 'fr' }, config({ selectedLanguage: LanguageCode.SPANISH }), {
    [ENV_KEYS.LANGUAGE]: 'pt',
  });
  assert.equal(o.language, LanguageCode.FRENCH);
});

test('an unknown language is rejected and the message lists the valid ones', () => {
  assert.throws(
    () => resolveOptions({ language: 'klingon' }, config(), {}),
    (e: unknown) => {
      assert.ok(e instanceof OptionError);
      assert.match(e.message, /Unknown language "klingon"/);
      assert.match(e.message, /es, en, pt, fr, de/);
      return true;
    },
  );
});

test('a language saved by an older version that is no longer valid falls back to English', () => {
  const o = resolveOptions({}, config({ selectedLanguage: 'sv' as LanguageCode }), {});
  assert.equal(o.language, LanguageCode.ENGLISH);
});

test('--no-copy turns off a clipboard that the configuration had on', () => {
  const o = resolveOptions({ copy: false }, config({ autoCopy: true }), {});
  assert.equal(o.copyToClipboard, false);
});

test('the clipboard falls back to the saved setting when no flag is given', () => {
  assert.equal(resolveOptions({}, config({ autoCopy: true }), {}).copyToClipboard, true);
  assert.equal(resolveOptions({}, config({ autoCopy: false }), {}).copyToClipboard, false);
});

test('a boolean environment variable accepts the usual spellings', () => {
  for (const raw of ['1', 'true', 'YES', 'on']) {
    assert.equal(
      resolveOptions({}, config({ autoCopy: false }), { [ENV_KEYS.COPY]: raw }).copyToClipboard,
      true,
      `${raw} should read as true`,
    );
  }
  assert.equal(
    resolveOptions({}, config({ autoCopy: true }), { [ENV_KEYS.COPY]: 'off' }).copyToClipboard,
    false,
  );
});

test('a boolean environment variable that means nothing is an error, not a silent false', () => {
  assert.throws(() => resolveOptions({}, config(), { [ENV_KEYS.COPY]: 'maybe' }), /Not a boolean/);
});

test('a glossary can be named with or without its extension', () => {
  assert.equal(
    resolveOptions({ glossary: 'devops' }, config(), {}, GLOSSARIES).glossary,
    'devops.txt',
  );
  assert.equal(
    resolveOptions({ glossary: 'devops.txt' }, config(), {}, GLOSSARIES).glossary,
    'devops.txt',
  );
});

test('an unknown glossary is rejected and the message lists what exists', () => {
  assert.throws(
    () => resolveOptions({ glossary: 'nope' }, config(), {}, GLOSSARIES),
    (e: unknown) => {
      assert.ok(e instanceof OptionError);
      assert.match(e.message, /devops, medicina/);
      return true;
    },
  );
});

test('asking for a glossary when none exist says so instead of listing nothing', () => {
  assert.throws(
    () => resolveOptions({ glossary: 'nope' }, config(), {}, []),
    /No glossaries found/,
  );
});

test('no glossary requested means none, even when some exist', () => {
  assert.equal(resolveOptions({}, config(), {}, GLOSSARIES).glossary, '');
});

test('empty environment variables are ignored rather than validated', () => {
  const o = resolveOptions({}, config({ selectedLanguage: LanguageCode.SPANISH }), {
    [ENV_KEYS.LANGUAGE]: '',
    [ENV_KEYS.GLOSSARY]: '',
    [ENV_KEYS.COPY]: '',
  });
  assert.equal(o.language, LanguageCode.SPANISH);
  assert.equal(o.glossary, '');
});

test('an option commander filled in by default is not treated as a flag', () => {
  const source = (key: string) => (key === 'copy' ? 'default' : undefined);
  const flags = cliFlags({ copy: true }, source);

  assert.deepEqual(flags, {});
  assert.equal(resolveOptions(flags, config({ autoCopy: false }), {}).copyToClipboard, false);
});

test('an option the user actually typed is kept', () => {
  const flags = cliFlags({ copy: false, language: 'fr' }, () => 'cli');
  assert.deepEqual(flags, { copy: false, language: 'fr' });
  assert.equal(resolveOptions(flags, config({ autoCopy: true }), {}).copyToClipboard, false);
});

test('--local picks the local engine whatever the configuration says', () => {
  assert.equal(
    resolveOptions({ local: true }, config({ engine: Engine.OPENAI }), {}).engine,
    Engine.LOCAL,
  );
});

test('--engine names the engine explicitly, for the day there is a third', () => {
  assert.equal(resolveOptions({ engine: 'local' }, config(), {}).engine, Engine.LOCAL);
  assert.equal(
    resolveOptions({ engine: 'openai' }, config({ engine: Engine.LOCAL }), {}).engine,
    Engine.OPENAI,
  );
});

test('an unknown engine is rejected and the message lists the real ones', () => {
  assert.throws(() => resolveOptions({ engine: 'whisper.cpp' }, config(), {}), /Unknown engine/);
});

test('with no flag the saved engine is kept', () => {
  assert.equal(resolveOptions({}, config({ engine: Engine.LOCAL }), {}).engine, Engine.LOCAL);
});

test('long audio asks for confirmation unless --yes or the environment says otherwise', () => {
  assert.equal(resolveOptions({}, config(), {}).confirmLongAudio, true);
  assert.equal(resolveOptions({ yes: true }, config(), {}).confirmLongAudio, false);
  assert.equal(resolveOptions({}, config(), { [ENV_KEYS.YES]: '1' }).confirmLongAudio, false);
});

test('the transcription notice is on by default and --no-wrap or the env turn it off', () => {
  assert.equal(resolveOptions({}, config(), {}).wrapClipboard, true);
  assert.equal(resolveOptions({ wrap: false }, config(), {}).wrapClipboard, false);
  assert.equal(resolveOptions({}, config({ wrapClipboard: false }), {}).wrapClipboard, false);
  assert.equal(resolveOptions({}, config(), { [ENV_KEYS.WRAP]: '0' }).wrapClipboard, false);
  assert.equal(
    resolveOptions({ wrap: true }, config({ wrapClipboard: false }), {}).wrapClipboard,
    true,
  );
});
