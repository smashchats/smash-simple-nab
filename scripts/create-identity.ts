#!/bin/node
import { IdentityProtocol, setEngine } from '2key-ratchet';
import { DIDDocManager, SmashMessaging } from 'smash-node-lib';

async function main() {
    setEngine('@peculiar/webcrypto', crypto);
    SmashMessaging.setCrypto(crypto);
    const didDocManager = new DIDDocManager();
    SmashMessaging.use(didDocManager);

    const identity = await didDocManager.generate();
    const theBourneIdentity = await identity.serialize();
    console.log(theBourneIdentity);
    console.warn(`New identity ${identity.did} generated.`);

    const testProtocolExported = await IdentityProtocol.fill(identity);
    const testProtocolExportedSignature = testProtocolExported.signature;
    const importedIdentity =
        await SmashMessaging.importIdentity(theBourneIdentity);

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
