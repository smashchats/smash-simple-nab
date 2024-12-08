import 'dotenv/config';

import { CryptoP11 } from '../src/crypto.js';

const signaturesBufferToHexString = (signatures: ArrayBuffer[]) => {
    return signatures.map((r) =>
        r !== undefined ? Buffer.from(r).toString('hex') : 'undefined',
    );
};

const CRYPTO_TIMEOUT_MS = 25000;

describe('CryptoP11 HSM Operations', () => {
    let crypto: CryptoP11;
    const HSM_CONFIG = JSON.parse(process.env.HSM_CONFIG || '{}');

    beforeAll(() => {
        crypto = new CryptoP11(HSM_CONFIG);
    });

    let keys: CryptoKeyPair;
    const alg: RsaHashedKeyGenParams = {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 2048,
    };
    const testData = [
        new Uint8Array(1024),
        new Uint8Array(1024),
        new Uint8Array(1024),
        new Uint8Array(1024),
    ];

    beforeAll(async () => {
        keys = (await crypto.subtle.generateKey(alg, false, [
            'verify',
            'sign',
        ])) as CryptoKeyPair;
    });

    it('should successfully perform sequential signing operations', async () => {
        const signatures: ArrayBuffer[] = [];

        for (const dataToSign of testData) {
            const signature = await crypto.subtle.sign(
                alg,
                keys.privateKey,
                dataToSign,
            );
            expect(signature).toBeDefined();
            signatures.push(signature);
        }

        expect(signatures).toHaveLength(testData.length);
        const hexSignatures = signaturesBufferToHexString(signatures);
        expect(hexSignatures).not.toContain('undefined');
    });

    it('should successfully perform parallel signing operations', async () => {
        const signatures = await Promise.all(
            testData.map((dataToSign) =>
                crypto.subtle.sign(alg, keys.privateKey, dataToSign),
            ),
        );
        for (const signature of signatures) {
            expect(signature).toBeDefined();
        }
        expect(signatures).toHaveLength(testData.length);
        const hexSignatures = signaturesBufferToHexString(signatures);
        expect(hexSignatures).not.toContain('undefined');
    });

    it('should perform parallel digest operations', async () => {
        const digests = await Promise.all(
            testData.map((data) => crypto.subtle.digest('SHA-256', data)),
        );
        for (const digest of digests) {
            expect(digest).toBeDefined();
        }
        expect(digests).toHaveLength(testData.length);
    });

    it('should perform parallel verify operations', async () => {
        // First get signatures to verify
        const signatures = await Promise.all(
            testData.map((data) =>
                crypto.subtle.sign(alg, keys.privateKey, data),
            ),
        );

        const verifications = await Promise.all(
            testData.map((data, i) =>
                crypto.subtle.verify(alg, keys.publicKey, signatures[i], data),
            ),
        );

        for (const verified of verifications) {
            expect(verified).toBe(true);
        }
        expect(verifications).toHaveLength(testData.length);
    });

    it(
        'should perform parallel encrypt/decrypt operations',
        async () => {
            const encryptAlg = {
                name: 'RSA-OAEP',
                hash: 'SHA-256',
            };

            // Generate encryption keys
            const encKeys = (await crypto.subtle.generateKey(
                {
                    ...encryptAlg,
                    modulusLength: 2048,
                    publicExponent: new Uint8Array([1, 0, 1]),
                },
                false,
                ['encrypt', 'decrypt'],
            )) as CryptoKeyPair;

            const smallerTestData = [new Uint8Array(100), new Uint8Array(100)];

            const encrypted = await Promise.all(
                smallerTestData.map((data) =>
                    crypto.subtle.encrypt(encryptAlg, encKeys.publicKey, data),
                ),
            );

            const decrypted = await Promise.all(
                encrypted.map((data) =>
                    crypto.subtle.decrypt(encryptAlg, encKeys.privateKey, data),
                ),
            );

            expect(encrypted).toHaveLength(2);
            expect(decrypted).toHaveLength(2);
        },
        CRYPTO_TIMEOUT_MS,
    );

    it(
        'should perform parallel deriveBits/deriveKey operations',
        async () => {
            const deriveAlg = {
                name: 'ECDH',
                namedCurve: 'P-256',
            };

            // Generate ECDH key pairs
            const keyPairA = (await crypto.subtle.generateKey(
                deriveAlg,
                false,
                ['deriveBits', 'deriveKey'],
            )) as CryptoKeyPair;

            const keyPairB = (await crypto.subtle.generateKey(
                deriveAlg,
                false,
                ['deriveBits', 'deriveKey'],
            )) as CryptoKeyPair;

            const deriveParams = {
                name: 'ECDH',
                public: keyPairB.publicKey,
            };

            // Parallel deriveBits - reduce bit length to match P-256 curve size
            const derivedBits = await Promise.all([
                crypto.subtle.deriveBits(deriveParams, keyPairA.privateKey, 32),
                crypto.subtle.deriveBits(deriveParams, keyPairA.privateKey, 32),
            ]);

            // Parallel deriveKey
            const aesParams = {
                name: 'AES-GCM',
                length: 256,
            };

            const derivedKeys = await Promise.all([
                crypto.subtle.deriveKey(
                    deriveParams,
                    keyPairA.privateKey,
                    aesParams,
                    false,
                    ['encrypt', 'decrypt'],
                ),
                crypto.subtle.deriveKey(
                    deriveParams,
                    keyPairA.privateKey,
                    aesParams,
                    false,
                    ['encrypt', 'decrypt'],
                ),
            ]);

            expect(derivedBits).toHaveLength(2);
            expect(derivedKeys).toHaveLength(2);
        },
        CRYPTO_TIMEOUT_MS,
    );

    it('should perform parallel wrap/unwrap operations', async () => {
        // Generate a key to wrap
        const aesKey = await crypto.subtle.generateKey(
            {
                name: 'AES-GCM',
                length: 256,
            },
            true,
            ['encrypt', 'decrypt'],
        );

        const wrapAlg = {
            name: 'RSA-OAEP',
            hash: 'SHA-256',
        };

        // Generate wrapping keys
        const wrapKeys = (await crypto.subtle.generateKey(
            {
                ...wrapAlg,
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
            },
            false,
            ['wrapKey', 'unwrapKey'],
        )) as CryptoKeyPair;

        const wrapped = await Promise.all([
            crypto.subtle.wrapKey('raw', aesKey, wrapKeys.publicKey, wrapAlg),
            crypto.subtle.wrapKey('raw', aesKey, wrapKeys.publicKey, wrapAlg),
        ]);

        const unwrapped = await Promise.all(
            wrapped.map((wrappedKey) =>
                crypto.subtle.unwrapKey(
                    'raw',
                    wrappedKey,
                    wrapKeys.privateKey,
                    wrapAlg,
                    {
                        name: 'AES-GCM',
                        length: 256,
                    } as KeyAlgorithm,
                    true,
                    ['encrypt', 'decrypt'],
                ),
            ),
        );

        expect(wrapped).toHaveLength(2);
        expect(unwrapped).toHaveLength(2);
    });

    it(
        'should perform parallel generateKey operations',
        async () => {
            const generateParams = {
                name: 'AES-GCM',
                length: 256,
            };

            const keys = await Promise.all([
                crypto.subtle.generateKey(generateParams, true, [
                    'encrypt',
                    'decrypt',
                ]),
                crypto.subtle.generateKey(generateParams, true, [
                    'encrypt',
                    'decrypt',
                ]),
            ]);

            expect(keys).toHaveLength(2);
            for (const key of keys) {
                expect(key).toBeDefined();
            }
        },
        CRYPTO_TIMEOUT_MS,
    );

    it(
        'should perform parallel importKey operations',
        async () => {
            const exportedPrivateKey = JSON.parse(
                '{"key_ops":["deriveKey","deriveBits"],"ext":true,"kty":"EC","x":"Xg8dSsr93TMctKPiG3yRZ72KTJihrzSTzE_vLk7m1to","y":"cJg1q3Mk08b_gw7pawTB9oZ2svkZE_6I0C26ZDJC0Qk","crv":"P-256","d":"ObBoSrita5E2pJXQOTC35amrY-8bTRq1SdbDFmawkDU"}',
            );
            const KEY_ALGORITHM = { name: 'ECDH', namedCurve: 'P-256' };
            const KEY_USAGE = ['deriveBits', 'deriveKey'];

            const importedKeys = await Promise.all(
                Array(3)
                    .fill(0)
                    .map(() =>
                        crypto.subtle.importKey(
                            'jwk',
                            exportedPrivateKey,
                            KEY_ALGORITHM,
                            true,
                            KEY_USAGE as KeyUsage[],
                        ),
                    ),
            );

            expect(importedKeys).toHaveLength(3);
            for (const key of importedKeys) {
                expect(key).toBeDefined();
                expect(key.algorithm.name).toEqual(KEY_ALGORITHM.name);
                expect(key.extractable).toBe(true);
                expect(key.usages).toEqual(expect.arrayContaining(KEY_USAGE));
            }
        },
        CRYPTO_TIMEOUT_MS,
    );

    it('should perform parallel exportKey operations', async () => {
        const keyPair = (await crypto.subtle.generateKey(alg, true, [
            'verify',
            'sign',
        ])) as CryptoKeyPair;

        const keysToExport = [
            { key: keyPair.privateKey, format: 'pkcs8' as KeyFormat },
            { key: keyPair.publicKey, format: 'spki' as KeyFormat },
            { key: keyPair.privateKey, format: 'jwk' as KeyFormat },
            { key: keyPair.publicKey, format: 'jwk' as KeyFormat },
        ];

        const exportedKeys = await Promise.all(
            keysToExport.map(({ key, format }) =>
                crypto.subtle.exportKey(format, key),
            ),
        );
        expect(exportedKeys.length).toBe(keysToExport.length);
    });
});
