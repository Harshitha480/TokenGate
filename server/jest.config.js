module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/helpers/setupEnv.js'],
  globalSetup: '<rootDir>/tests/helpers/globalSetup.js',
  globalTeardown: '<rootDir>/tests/helpers/globalTeardown.js',
  collectCoverageFrom: ['src/**/*.js', '!src/index.js'],
  // A floor a few points under today's numbers: regressions fail CI, refactors do not.
  coverageThreshold: {
    global: { statements: 90, branches: 80, functions: 85, lines: 90 },
  },
  testTimeout: 20_000,
};
