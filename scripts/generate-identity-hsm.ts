#!/bin/node
import { IECKeyPair, Identity, setEngine } from '2key-ratchet';
import 'dotenv/config';
import { Crypto as CryptoP11 } from 'node-webcrypto-p11';
import { SPLITTER } from 'src/crypto.js';

const sleep = (ms: number) =>
    new Promise<void>((r) => {
        setTimeout(r, ms);
    });

async function main() {
    if (!process.env.HSM_CONFIG) {
        console.error('HSM_CONFIG missing.');
        return process.exit(1);
    }
    const config = JSON.parse(process.env.HSM_CONFIG);
    const crypto = new CryptoP11(config);
    setEngine('@peculiar/webcrypto', crypto as unknown as Crypto);

    // const NODE_PATH = process.argv[0];
    // const SCRIPT_PATH = process.argv[1];
    if (process.argv.length < 3) {
        console.error(
            'usage: npm run identity <DID> <NB_PREKEYS> <NB_ONETIMEKEYS>',
        );
        return process.exit(1);
    }

    const DID = parseInt(process.argv[2] || '0');
    const NB_PREKEYS = parseInt(process.argv[3] || '0');
    const NB_ONETIME = parseInt(process.argv[4] || '0');
    const SKIP_CLEAR_STORAGE = !!process.argv[5] || false;

    // CLEAR STORAGE
    if (!SKIP_CLEAR_STORAGE) {
        const WARN_DURATION = 3;
        for (let i = 0; i < WARN_DURATION; ++i) {
            console.warn(
                `WARNING:  KEYSTORAGE WILL BE CLEARED  — EXIT TO ABORT (${WARN_DURATION - i}s)`,
            );
            await sleep(1100);
        }
        await crypto.keyStorage.clear();
    }

    // generate new Identity, generating as many pre-keys and one-time pre-keys as requested
    const identity = await Identity.create(DID, NB_PREKEYS, NB_ONETIME, false);

    // persisting all the newly created keys to HSM
    const persistKeyPairToHSMStorage = async (key: IECKeyPair) => {
        const trim = (id: string) => id.split(SPLITTER)[2];
        const thumb = key.publicKey.id;
        const privateKeyId = trim(
            await crypto.keyStorage.setItem(key.privateKey),
        );
        const publicKeyId = trim(
            await crypto.keyStorage.setItem(key.publicKey.key),
        );
        if (privateKeyId !== publicKeyId)
            throw new Error("Private and Public Keys HSM IDs don't match.");
        return [thumb, publicKeyId];
    };
    const allKeysToPersist = [
        identity.exchangeKey,
        identity.signingKey,
        ...identity.signedPreKeys,
        ...identity.preKeys,
    ];
    const allKeysPersisted = await Promise.all(
        allKeysToPersist.map((keyPair) => persistKeyPairToHSMStorage(keyPair)),
    );

    console.log(`{
        "identity": ${JSON.stringify(await identity.toJSON())},
        "map": ${JSON.stringify(allKeysPersisted)}
    }`);

    const keysMapping = new Map<string, string>(
        allKeysPersisted as Iterable<[string, string]>,
    );
    console.warn(
        `New identity ${identity.id} generated with ${identity.preKeys.length} one-time prekeys and ${identity.signedPreKeys.length} prekeys.`,
    );
    console.warn(
        `The following ${keysMapping.size} keys have been stored to HSM storage:`,
    );
    console.warn(
        JSON.stringify(Object.fromEntries(keysMapping.entries()), null, 2),
    );
}

main();
