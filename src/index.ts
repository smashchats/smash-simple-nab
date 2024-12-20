import 'dotenv/config';
import express, { Response } from 'express';
import * as fs from 'fs';
import { ObjectClass } from 'graphene-pk11';
import http from 'http';
import { CryptoParams } from 'node-webcrypto-p11';
import type { IMProfile, Identity, SMEConfig } from 'smash-node-lib';
import { ECPublicKey, SmashMessaging } from 'smash-node-lib';

import { Bot } from './bot.js';
import { CryptoP11, SPLITTER } from './crypto.js';

interface IJsonIdentity {
    id: number;
    signingKey: CryptoKeyPair;
    exchangeKey: CryptoKeyPair;
    preKeys: CryptoKeyPair[];
    signedPreKeys: CryptoKeyPair[];
    createdAt: string;
}

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
): Promise<Identity> => {
    return new Promise((resolve) => {
        fs.readFile(filepath, 'utf8', async (error, data) => {
            if (error) return console.error(error);

            const hsmIdentity = JSON.parse(data) as {
                identity: IJsonIdentity;
                map: string[][];
            };

            const keysMapping = new Map<string, string>(
                hsmIdentity.map as Iterable<[string, string]>,
            );

            const c = new CryptoP11(hsmConfig as CryptoParams);
            SmashMessaging.setCrypto(c as unknown as Crypto);

            const identity = await SmashMessaging.deserializeIdentity(
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

    constructor(identity: Identity) {
        super(identity, 'NAB', 'DEBUG', NAB_META);
    }

    public async start(smes: SMEConfig[]) {
        await this.setEndpoints(smes);
        await this.printJoinInfo(smes);
        this.setupGraphVisualization();
    }

    public async stop() {
        await super.stop();
        if (this.server) this.server.close();
    }

    private setupGraphVisualization() {
        const app = express();
        app.get('/', (_, res: Response) => {
            res.setHeader('Content-Type', 'text/html');
            const graphStr = JSON.stringify(
                (this.graph.json() as unknown as { elements: never[] })[
                    'elements'
                ],
            );
            res.send(`
              <style>
              div#cy {
                width: 100%;
                height: 100%;
              }
              </style>
              <body>
              <div id="cy">
              </div>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.3/cytoscape.min.js"></script>
              <script>
                var cy = window.cy = cytoscape({
                    container: document.getElementById('cy'),
                    layout: {
                        name: 'cose',
                        idealEdgeLength: function (edge) {
                            // Default is: 10
                            // Instead, base it on "weight"
                            return edge.data().weight * 2
                        },
                        edgeElasticity: function (edge) {
                            // Default is: 100
                            // Instead, base it on "weight"
                            return edge.data().weight * 10
                        },
                        nodeOverlap: 20,
                        refresh: 20,
                        fit: true,
                        padding: 30,
                        randomize: false,
                        componentSpacing: 100,
                        nodeRepulsion: 400000,
                        nestingFactor: 5,
                        gravity: 80,
                        numIter: 1000,
                        initialTemp: 200,
                        coolingFactor: 0.95,
                        minTemp: 1.0
                    },
                    elements: ${graphStr},
                    style: [
                        {
                            selector: 'node',
                            style: {
                                label: 'data(id)',
                            },
                        },
                        {
                            selector: 'edge',
                            style: {
                                'label': 'data(weight)',
                                'width': 3,
                                'line-color': '#ccc',
                                'target-arrow-color': '#ccc',
                                'target-arrow-shape': 'triangle',
                                'curve-style': 'bezier'
                            },
                        }
                    ],
                });
                </script>
              </body>
          `);
        });
        const port = 3030;
        this.server = app.listen(port, () => {
            console.log(`>>> open users graph at http://localhost:${port}`);
        });
    }
}

loadIdentityFromFile(HSM_CONFIG, process.env.NAB_ID_FILEPATH!).then(
    async (identity) => {
        const bot = new BotGraphVisualizer(identity);
        process.on('unhandledRejection', (reason, promise) => {
            SmashMessaging.handleError(reason, promise, bot.getLogger());
        });
        return await bot.start([SME_CONFIG]);
    },
);
