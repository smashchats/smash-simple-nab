#!/bin/node
import { setEngine } from '2key-ratchet';
import 'dotenv/config';
import { ObjectClass } from 'graphene-pk11';
import { CryptoP11, SPLITTER } from 'src/crypto.js';

async function main() {
    if (!process.env.HSM_CONFIG) {
        console.error('HSM_CONFIG missing.');
        return process.exit(1);
    }
    const config = JSON.parse(process.env.HSM_CONFIG);
    const cp11 = new CryptoP11(config);
    setEngine('@peculiar/webcrypto', cp11 as unknown as Crypto);

    // const NODE_PATH = process.argv[0];
    // const SCRIPT_PATH = process.argv[1];
    const ID = process.argv[2];
    console.log(`Loading key with ID ${ID}`);

    console.log(await cp11.keyStorage.keys());

    const ALG = { name: 'ECDSA', hash: 'SHA-512' };
    const SIGN = ['sign'];
    const VERIFY = ['verify'];

    const privateKey = await cp11.keyStorage.getItem(
        [ObjectClass.PRIVATE_KEY, ID].join(SPLITTER),
        ALG,
        false,
        SIGN as unknown as KeyUsage[],
    );
    console.log(`> Private key ${privateKey.id.toString()} loaded`);
    const publicKey = await cp11.keyStorage.getItem(
        [ObjectClass.PUBLIC_KEY, ID].join(SPLITTER),
        ALG,
        false,
        VERIFY as unknown as KeyUsage[],
    );
    console.log(`> Public key ${privateKey.id.toString()} loaded`);

    console.log(`> Generating signature...`);
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-512' } as KeyAlgorithm,
        privateKey as unknown as globalThis.CryptoKey,
        Buffer.from('Hello world!'),
    );
    const ok = await (cp11 as unknown as Crypto).subtle.verify(
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
