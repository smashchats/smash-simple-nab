import 'dotenv/config';
import express, { Response } from 'express';
import * as fs from 'fs';
import { ObjectClass } from 'graphene-pk11';
import http from 'http';
import { Crypto as CryptoP11 } from 'node-webcrypto-p11';
import {
    ECPublicKey,
    Identity,
    SMEConfig,
    SmashMessaging,
} from 'smash-node-lib';

import { Bot } from './bot.js';
import { SPLITTER, createCryptoP11FromConfig } from './crypto.js';

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
    keys: CryptoKeyPair & { thumbprint: string },
    keysMapping: Map<string, string>,
) => {
    const storedId = keysMapping.get(keys.thumbprint);
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
    hsmConfig: any,
    filepath: string,
): Promise<Identity> => {
    return new Promise((resolve, reject) => {
        fs.readFile(filepath, 'utf8', async (error, data) => {
            if (error) return console.error(error);

            const hsmIdentity = JSON.parse(data) as {
                identity: IJsonIdentity;
                map: string[][];
            };

            const keysMapping = new Map<string, string>(
                hsmIdentity.map as Iterable<[string, string]>,
            );

            const c = createCryptoP11FromConfig(hsmConfig);
            SmashMessaging.setCrypto(c as unknown as Crypto);

            const identity = await SmashMessaging.parseIdentityJson(
                hsmIdentity.identity,
                async (keys: CryptoKeyPair & { thumbprint: string }) =>
                    retrieveKeysFromStorage(c, keys, keysMapping),
            );

            resolve(identity);
        });
    });
};

if (!checkEnvironmentVariables(['HSM_CONFIG', 'NAB_ID_FILEPATH', 'SME_CONFIG']))
    process.exit(1);

const SME_CONFIG = JSON.parse(process.env.SME_CONFIG!) as SMEConfig;
const HSM_CONFIG = JSON.parse(process.env.HSM_CONFIG!);

class BotGraphVisualizer extends Bot {
    private server?: http.Server;

    constructor(identity: Identity) {
        super(identity);
    }

    public async start() {
        await super.start();
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
                (this.graph.json() as any)['elements'],
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
              <script type="module">
              import cytoscape from "https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.29.2/cytoscape.esm.min.mjs";
                var cy = cytoscape({
                  container: document.getElementById('cy'),
                  elements: ${graphStr},
                  layout: {
                    name: 'cose',
                    ready: function(){},
                    stop: function(){},
                    animate: true,
                    animationEasing: undefined,
                    animationDuration: undefined,
                    animateFilter: function ( node, i ){ return true; },
                    animationThreshold: 250,
                    refresh: 20,
                    fit: true,
                    padding: 30,
                    boundingBox: undefined,
                    nodeDimensionsIncludeLabels: false,
                    randomize: false,
                    componentSpacing: 40,
                    nodeRepulsion: function( node ){ return 2048; },
                    nodeOverlap: 4,
                    idealEdgeLength: function( edge ){ return 32; },
                    edgeElasticity: function( edge ){ return 32; },
                    nestingFactor: 1.2,
                    gravity: 1,
                    numIter: 1000,
                    initialTemp: 1000,
                    coolingFactor: 0.99,
                    minTemp: 1.0
                  },
                  style: [
                    {
                        selector: 'node',
                        style: {
                            label: 'data(short)',
                        },
                    },
                    {
                        selector: 'edge',
                        style: {
                            'width': 3,
                            'line-color': '#ccc',
                            'target-arrow-color': '#ccc',
                            'target-arrow-shape': 'triangle',
                            'curve-style': 'bezier'
                        },
                    },
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
    (identity) => {
        const bot = new BotGraphVisualizer(identity);
        bot.initEndpoints([SME_CONFIG]).then(() => bot.start());
    },
);
