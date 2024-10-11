#!/bin/node
import { Identity, IdentityProtocol, setEngine } from '2key-ratchet';

interface IJWKJson {
    jwk: JsonWebKey;
    algorithm: KeyAlgorithm;
    usages: KeyUsage[];
}

// Module augmentation to add the `toJSON` method to the CryptoKey interface
declare global {
    interface CryptoKey {
        toJSON: () => IJWKJson;
        _exportedJwk?: JsonWebKey;
    }
}
Object.defineProperty(CryptoKey.prototype, 'toJSON', {
    value: function () {
        return {
            jwk: this._exportedJwk,
            algorithm: this.algorithm,
            usages: this.usages,
        } as IJWKJson;
    },
    writable: true,
    configurable: true,
});

// Wrap the original generateKey method
const originalGenerateKey = crypto.subtle.generateKey;
crypto.subtle.generateKey = async function (
    this: SubtleCrypto, // Explicitly typing `this`
    ...args: Parameters<typeof originalGenerateKey>
): ReturnType<typeof originalGenerateKey> {
    const keyPairOrSingleKey = await originalGenerateKey.apply(this, args);
    const attachJwk = async (key: CryptoKey) => {
        key._exportedJwk = await crypto.subtle.exportKey('jwk', key);
    };
    if (keyPairOrSingleKey instanceof CryptoKey) {
        await attachJwk(keyPairOrSingleKey);
    } else {
        await attachJwk(keyPairOrSingleKey.privateKey);
        await attachJwk(keyPairOrSingleKey.publicKey);
    }
    return keyPairOrSingleKey;
} as typeof crypto.subtle.generateKey;

// Function to reconstitute a single CryptoKey from a JWK
async function reconstituteCryptoKey(key: IJWKJson): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        'jwk',
        key.jwk,
        key.algorithm,
        true,
        key.usages,
    );
}

// Function to reconstitute the entire object with CryptoKey pairs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function reconstituteKeys(obj: any): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function reconstituteKeyPair(keyPair: any) {
        return {
            privateKey: await reconstituteCryptoKey(keyPair.privateKey),
            publicKey: await reconstituteCryptoKey(keyPair.publicKey),
            thumbprint: keyPair.thumbprint,
        };
    }

    // Directly access and reconstitute keys in known locations
    obj.exchangeKey = await reconstituteKeyPair(obj.exchangeKey);
    obj.signingKey = await reconstituteKeyPair(obj.signingKey);

    for (let i = 0; i < obj.preKeys.length; i++) {
        obj.preKeys[i] = await reconstituteKeyPair(obj.preKeys[i]);
    }

    for (let i = 0; i < obj.signedPreKeys.length; i++) {
        obj.signedPreKeys[i] = await reconstituteKeyPair(obj.signedPreKeys[i]);
    }

    return obj;
}

// Combine parsing and reconstituting into one function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseAndReconstituteCryptoKeys(
    jsonString: string,
): Promise<any> {
    const parsedObject = JSON.parse(jsonString);
    return await reconstituteKeys(parsedObject);
}

async function main() {
    if (process.argv.length < 3) {
        console.error(
            'usage: npm run identity <DID> <NB_PREKEYS> <NB_ONETIMEKEYS>',
        );
        return process.exit(1);
    }
    // const NODE_PATH = process.argv[0];
    // const SCRIPT_PATH = process.argv[1];
    const DID = parseInt(process.argv[2] || '0');
    const NB_PREKEYS = parseInt(process.argv[3] || '0');
    const NB_ONETIME = parseInt(process.argv[4] || '0');
    setEngine('@peculiar/webcrypto', crypto);
    const identity = await Identity.create(DID, NB_PREKEYS, NB_ONETIME, true);
    const theBourneIdentity = JSON.stringify(await identity.toJSON());
    console.log(theBourneIdentity);
    console.warn(
        `New identity ${identity.id} generated with ${identity.preKeys.length} one-time prekeys and ${identity.signedPreKeys.length} prekeys.`,
    );

    const testProtocolExported = await IdentityProtocol.fill(identity);
    const testProtocolExportedSignature = testProtocolExported.signature;
    const importedIdentity = await Identity.fromJSON(
        await parseAndReconstituteCryptoKeys(theBourneIdentity),
    );
    const testProtocolImported = await IdentityProtocol.fill(importedIdentity);
    if (!(await testProtocolImported.verify())) {
        console.error(`Exported identity is inconsistent!`);
    } else {
        testProtocolImported.signature = testProtocolExportedSignature;
        if (await testProtocolImported.verify()) {
            console.warn(`Exported identity consistent and verified.`);
        } else {
            console.error(`Exported identity isnt verified!`);
        }
    }
}

main();
