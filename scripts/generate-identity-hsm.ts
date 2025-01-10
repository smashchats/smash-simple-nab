#!/bin/node
import { IECKeyPair, setEngine } from '2key-ratchet';
import 'dotenv/config';
import { Crypto as CryptoP11 } from 'node-webcrypto-p11';
import { DIDDocManager, SmashMessaging } from 'smash-node-lib';
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

    const SKIP_CLEAR_STORAGE = !!process.argv[2] || false;

    const config = JSON.parse(process.env.HSM_CONFIG);
    const c = new CryptoP11(config);
    setEngine('@peculiar/webcrypto', c as unknown as Crypto);
    SmashMessaging.setCrypto(c as unknown as Crypto);

    // CLEAR STORAGE
    if (!SKIP_CLEAR_STORAGE) {
        const WARN_DURATION = 3;
        for (let i = 0; i < WARN_DURATION; ++i) {
            console.warn(
                `WARNING:  KEYSTORAGE WILL BE CLEARED  — EXIT TO ABORT (${WARN_DURATION - i}s)`,
            );
            await sleep(1100);
        }
        await c.keyStorage.clear();
    }

    const didDocManager = new DIDDocManager();
    SmashMessaging.use(didDocManager);
    const identity = await didDocManager.generate();
    await didDocManager.generateNewPreKeyPair(identity);

    // persisting all the newly created keys to HSM
    const persistKeyPairToHSMStorage = async (key: IECKeyPair) => {
        const trim = (id: string) => id.split(SPLITTER)[2];
        const thumb = key.publicKey.id;
        const privateKeyId = trim(await c.keyStorage.setItem(key.privateKey));
        const publicKeyId = trim(await c.keyStorage.setItem(key.publicKey.key));
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
