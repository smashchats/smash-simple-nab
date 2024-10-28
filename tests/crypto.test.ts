import 'dotenv/config';

import { CryptoP11 } from '../src/crypto.js';

const logSignatures = (signatures: ArrayBuffer[]) => {
    return signatures.map((r) =>
        r !== undefined ? Buffer.from(r).toString('hex') : 'undefined',
    );
};

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
    const testData = [new Uint8Array(1024), new Uint8Array(1024)];

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

        expect(signatures).toHaveLength(2);
        const hexSignatures = logSignatures(signatures);
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
        expect(signatures).toHaveLength(2);
        const hexSignatures = logSignatures(signatures);
        expect(hexSignatures).not.toContain('undefined');
    });
});
