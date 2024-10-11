#!/bin/node
import { setEngine } from '2key-ratchet';
import 'dotenv/config';
import { ObjectClass, SessionObject } from 'graphene-pk11';
import { Crypto } from 'node-webcrypto-p11';
import { SPLITTER } from 'src/crypto.js';

export const overrideCryptoObject = (crypto: Crypto) => {
    // @ts-ignore
    crypto.keyStorage.getItemById = (
        classAndId: string,
    ): SessionObject | null => {
        const [keyClass, id] = classAndId.split(SPLITTER);
        let key = null;
        crypto.session.find(
            {
                class: parseInt(keyClass),
                token: true,
                id: Buffer.from(id, 'hex'),
            },
            (obj) => {
                key = obj.toType<any>();
                return false;
            },
        );
        return key;
    };
};

async function main() {
    if (!process.env.HSM_CONFIG) {
        console.error('HSM_CONFIG missing.');
        return process.exit(1);
    }
    const config = JSON.parse(process.env.HSM_CONFIG);
    const crypto = new Crypto(config);
    setEngine('@peculiar/webcrypto', crypto as unknown as globalThis.Crypto);
    overrideCryptoObject(crypto);

    // const NODE_PATH = process.argv[0];
    // const SCRIPT_PATH = process.argv[1];
    const ID = process.argv[2];
    console.log(`Loading key with ID ${ID}`);

    console.log(await crypto.keyStorage.keys());

    const ALG = { name: 'ECDSA', hash: 'SHA-512' };
    const SIGN = ['sign'];
    const VERIFY = ['verify'];

    const privateKey = await crypto.keyStorage.getItem(
        [ObjectClass.PRIVATE_KEY, ID].join(SPLITTER),
        ALG,
        false,
        SIGN as unknown as globalThis.KeyUsage[],
    );
    console.log(`> Private key ${privateKey.id.toString()} loaded`);
    const publicKey = await crypto.keyStorage.getItem(
        [ObjectClass.PUBLIC_KEY, ID].join(SPLITTER),
        ALG,
        false,
        VERIFY as unknown as globalThis.KeyUsage[],
    );
    console.log(`> Public key ${privateKey.id.toString()} loaded`);

    console.log(`> Generating signature...`);
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-512' } as globalThis.KeyAlgorithm,
        privateKey as unknown as globalThis.CryptoKey,
        Buffer.from('Hello world!'),
    );
    const ok = await crypto.subtle.verify(
        ALG,
        publicKey as unknown as globalThis.CryptoKey,
        signature,
        Buffer.from('Hello world!'),
    );
    console.log(
        `> Verification: ${ok} (${Buffer.from(signature).toString('hex')})`,
    );
}

main();
