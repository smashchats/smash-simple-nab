/** @type {import('ts-jest').JestConfigWithTsJest} **/

module.exports = {
    preset: 'ts-jest/presets/default-esm',
    moduleFileExtensions: ['ts', 'js', 'json'],
    testEnvironment: 'node',
    rootDir: './',
    coverageDirectory: './coverage',
    testMatch: ['<rootDir>/tests/**/*.test.ts'],
    testPathIgnorePatterns: ['node_modules'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@src/(.*)\\.js$': '<rootDir>/smash-node-lib/src/$1.ts',
        'smash-node-lib': '<rootDir>/smash-node-lib/src/index.ts',
    },
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                useESM: true,
            },
        ],
    },
    setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
    globalSetup: '<rootDir>/tests/jest.global.cjs',
    globalTeardown: '<rootDir>/tests/jest.teardown.cjs',
};
