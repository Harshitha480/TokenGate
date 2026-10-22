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

  it('returns an immutable config object', () => {
    const config = loadConfig(validEnv);

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.jwt)).toBe(true);
  });
});
