/** @type {import('ts-jest').JestConfigWithTsJest} */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const baseConfig = require('./jest.config.cjs');

module.exports = {
    ...baseConfig,
    // Override only the testMatch to run integration tests
    testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
};
