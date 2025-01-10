import 'dotenv/config';
import * as fs from 'fs';
import { ObjectClass } from 'graphene-pk11';
import http from 'http';
import { CryptoParams } from 'node-webcrypto-p11';
import type {
    IIMPeerIdentity,
    IMPeerIdentity,
    IMProfile,
    SMEConfig,
} from 'smash-node-lib';
import { DIDDocManager, ECPublicKey, SmashMessaging } from 'smash-node-lib';

import { Bot } from './bot.js';
import { CryptoP11, SPLITTER } from './crypto.js';

const checkEnvironmentVariables = (requiredVars: string[]): boolean => {
    let errors = 0;
    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            console.error(`${varName} missing.`);
            errors++;
        }
    }
    return errors === 0;
};

const retrieveKeysFromStorage = async (
    c: CryptoP11,
    keys: CryptoKeyPair & { thumbprint?: string },
    keysMapping: Map<string, string>,
) => {
    const storedId = keysMapping.get(keys.thumbprint!);
    console.info('retrieving keys from storage', keys.thumbprint, storedId);

    if (!storedId) {
        throw new Error("Keys couldn't be retrieved from storage.");
    }

    const privateKey = await c.keyStorage.getItem(
        [ObjectClass.PRIVATE_KEY, storedId].join(SPLITTER),
        keys.privateKey.algorithm,
        keys.privateKey.extractable,
        keys.privateKey.usages,
    );
    const publicKey = await c.keyStorage.getItem(
        [ObjectClass.PUBLIC_KEY, storedId].join(SPLITTER),
        keys.publicKey.algorithm,
        keys.publicKey.extractable,
        keys.publicKey.usages,
    );

    return {
        privateKey: privateKey as unknown as globalThis.CryptoKey,
        publicKey: await ECPublicKey.create(
            publicKey as unknown as globalThis.CryptoKey,
        ),
    };
};

const loadIdentityFromFile = (
    hsmConfig: unknown,
    filepath: string,
): Promise<IMPeerIdentity> => {
    return new Promise((resolve) => {
        fs.readFile(filepath, 'utf8', async (error, data) => {
            if (error) return console.error(error);
            const hsmIdentity = JSON.parse(data) as {
                identity: IIMPeerIdentity;
                map: string[][];
            };
            const keysMapping = new Map<string, string>(
                hsmIdentity.map as Iterable<[string, string]>,
            );

            const c = new CryptoP11(hsmConfig as CryptoParams);
            SmashMessaging.setCrypto(c as unknown as Crypto);

            const identity = await SmashMessaging.importIdentity(
                hsmIdentity.identity,
                async (keys: CryptoKeyPair & { thumbprint?: string }) =>
                    retrieveKeysFromStorage(c, keys, keysMapping),
            );
            resolve(identity);
        });
    });
};

if (
    !checkEnvironmentVariables([
        'HSM_CONFIG',
        'NAB_ID_FILEPATH',
        'SME_CONFIG',
        'NAB_META',
    ])
)
    process.exit(1);

const SME_CONFIG = JSON.parse(process.env.SME_CONFIG!) as SMEConfig;
const HSM_CONFIG = JSON.parse(process.env.HSM_CONFIG!);
const NAB_META = JSON.parse(process.env.NAB_META!) as IMProfile;

class BotGraphVisualizer extends Bot {
    private server?: http.Server;
    private started: boolean = false;
    private closed: boolean = false;

    public async start(smes: SMEConfig[]) {
        this.logger.debug('Starting BotGraphVisualizer...');
        this.logger.debug(
            `Current state - started: ${this.started}, closed: ${this.closed}`,
        );

        if (this.started || this.closed) {
            this.logger.error(
                `Bot already ${this.started ? 'started' : 'closed'}`,
            );
            return;
        }

        this.logger.debug('Initializing DIDDocManager...');
        const didDocManager = new DIDDocManager();
        SmashMessaging.use(didDocManager);
        didDocManager.set(await this.identity.getDIDDocument());

        this.logger.debug(`Connecting to ${smes.length} SME endpoints...`);
        await Promise.all(
            smes.map(async (sme) => {
                this.logger.debug(
                    `Generating new pre-key pair for SME ${sme.url}...`,
                );
                this.logger.debug(`Connecting to SME ${sme.url}...`);
                await this.endpoints.connect(
                    sme,
                    this.identity.signedPreKeys[0]!,
                );
                this.logger.debug(`Successfully connected to SME ${sme.url}`);
            }),
        );

        this.logger.debug('Updating bot metadata...');
        await this.updateMeta(NAB_META);

        this.logger.debug('Getting and setting DID document...');
        const didDoc = await this.getDIDDocument();
        didDocManager.set(didDoc);
        this.logger.debug(`DID document set for ${didDoc.id}`);

        this.logger.debug('Printing join info...');
        await this.printJoinInfo(smes);

        this.started = true;
        this.logger.debug('BotGraphVisualizer successfully started');
    }

    public async stop() {
        this.logger.debug('Stopping BotGraphVisualizer...');

        this.logger.debug('Calling parent stop method...');
        await super.stop();

        if (this.server) {
            this.logger.debug('Closing HTTP server...');
            this.server.close();
        }

        this.started = false;
        this.closed = true;
        this.logger.debug('BotGraphVisualizer successfully stopped');
    }
}

loadIdentityFromFile(HSM_CONFIG, process.env.NAB_ID_FILEPATH!).then(
    async (identity) => {
        const bot = new BotGraphVisualizer(identity, 'NAB', 'DEBUG');
        process.on('unhandledRejection', (reason, promise) => {
            SmashMessaging.handleError(reason, promise, bot.getLogger());
        });
        return await bot.start([SME_CONFIG]);
    },
);
