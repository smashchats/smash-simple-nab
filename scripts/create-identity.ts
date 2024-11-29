#!/bin/node
import { Identity, IdentityProtocol, setEngine } from '2key-ratchet';
import { SmashMessaging } from '@src/index.js';

async function main() {
    if (process.argv.length < 3) {
        console.error(
            'usage: npm run identity <ID> <NB_PREKEYS> <NB_ONETIMEKEYS>',
        );
        return process.exit(1);
    }
    // const NODE_PATH = process.argv[0];
    // const SCRIPT_PATH = process.argv[1];
    const ID = parseInt(process.argv[2] || '0');
    const NB_PREKEYS = parseInt(process.argv[3] || '0');
    const NB_ONETIME = parseInt(process.argv[4] || '0');
    setEngine('@peculiar/webcrypto', crypto);
    const identity = await SmashMessaging.generateIdentity(
        NB_PREKEYS,
        NB_ONETIME,
        true,
    );
    const theBourneIdentity = JSON.stringify(
        await SmashMessaging.serializeIdentity(identity),
    );
    console.log(theBourneIdentity);
    console.warn(
        `New identity ${identity.id} generated with ${identity.preKeys.length} one-time prekeys and ${identity.signedPreKeys.length} prekeys.`,
    );

    const testProtocolExported = await IdentityProtocol.fill(identity);
    const testProtocolExportedSignature = testProtocolExported.signature;
    const importedIdentity = await SmashMessaging.deserializeIdentity(
        JSON.parse(theBourneIdentity),
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
