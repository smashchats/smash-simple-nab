/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: './src',
    coverageDirectory: '../coverage',
    transform: {},
    testMatch: ['<rootDir>/**/*.spec.ts'],
    testPathIgnorePatterns: ['<rootDir>/node_modules'],
};
