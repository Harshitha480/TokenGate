const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { loadConfig } = require('../../src/config/env');

const validEnv = {
  MONGO_URI: 'mongodb://localhost:27017/tokengate',
  JWT_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('applies defaults for optional settings', () => {
    const config = loadConfig(validEnv);

    expect(config.port).toBe(5001);
    expect(config.logPrompts).toBe(false);
    expect(config.jwt.expiresIn).toBe('12h');
  });

  it('parses boolean flags from strings', () => {
    expect(loadConfig({ ...validEnv, LOG_PROMPTS: 'true' }).logPrompts).toBe(true);
  });

  it('fails fast with every problem listed', () => {
    expect(() => loadConfig({ JWT_SECRET: 'short' })).toThrow(
      /MONGO_URI[\s\S]*JWT_SECRET must be at least 32 characters/,
    );
  });

  it('treats empty values as unset, so the shipped .env.example boots', () => {
    const example = dotenv.parse(fs.readFileSync(path.join(__dirname, '../../.env.example')));

    const config = loadConfig(example);

    expect(config.providers.nvidia.apiKey).toBeNull();
    expect(config.upstash).toEqual({ url: null, token: null });
    expect(config.cache.driver).toBe('mongo');
  });

  it('returns an immutable config object', () => {
    const config = loadConfig(validEnv);

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.jwt)).toBe(true);
  });
});
