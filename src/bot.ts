import cytoscape from 'cytoscape';
import 'dotenv/config';
import express, { Response } from 'express';
import * as fs from 'fs';
import { ObjectClass } from 'graphene-pk11';
import { Crypto as CryptoP11 } from 'node-webcrypto-p11';
import {
    ECPublicKey,
    SMEConfig,
    SmashDID,
    SmashMessaging,
    SmashNAB,
} from 'smash-node-lib';

import { SPLITTER, createCryptoP11FromConfig } from './crypto.js';

interface IJsonIdentity {
    id: number;
    signingKey: CryptoKeyPair;
    exchangeKey: CryptoKeyPair;
    preKeys: CryptoKeyPair[];
    signedPreKeys: CryptoKeyPair[];
    createdAt: string;
}

// Smash Neighborhood Admin Bot (NAB) 0.0.0-alpha

// Helper functions
const checkEnvironmentVariables = (): boolean => {
    const requiredVars = ['HSM_CONFIG', 'NAB_ID_FILEPATH', 'SME_CONFIG'];
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

// Main function to start the NAB
async function start() {
    // Check for required environment variables
    if (!checkEnvironmentVariables()) {
        return process.exit(1);
    }

    // Parse configuration
    const SME_CONFIG = JSON.parse(process.env.SME_CONFIG!) as SMEConfig;
    const HSM_CONFIG = JSON.parse(process.env.HSM_CONFIG!);

    // TODO: keys should be auto-managed interacting with both a PLC and an HSM (out of scope for v0.0.1)
    fs.readFile(process.env.NAB_ID_FILEPATH!, 'utf8', async (error, data) => {
        if (error) return console.error(error);

        const hsmIdentity = JSON.parse(data) as {
            identity: IJsonIdentity;
            map: string[][];
        };
        const keysMapping = new Map<string, string>(
            hsmIdentity.map as Iterable<[string, string]>,
        );

        // Initialize crypto
        const c = createCryptoP11FromConfig(HSM_CONFIG);
        SmashMessaging.setCrypto(c as unknown as Crypto);

        // Parse identity
        const identity = await SmashMessaging.parseIdentityJson(
            hsmIdentity.identity,
            async (keys: CryptoKeyPair & { thumbprint: string }) =>
                retrieveKeysFromStorage(c, keys, keysMapping),
        );

        // Initialize NAB
        const nab = new SmashNAB(identity);
        await nab.initEndpoints([SME_CONFIG]);

        console.log('JOIN INFO:');
        console.log(JSON.stringify(await nab.getJoinInfo([SME_CONFIG])));

        type GraphEntry = {
            did: SmashDID;
            score: number;
            node: cytoscape.CollectionReturnValue;
        };
        const users: GraphEntry[] = [];
        const graph = cytoscape();
        const exportUsers = () =>
            users.map((user) => ({ ...user, node: undefined }));

        const sendUsersToSession = async (did: SmashDID) => {
            await nab.sendMessage(did, {
                type: 'profiles',
                data: exportUsers(),
            });
        };

        const DEFAULT_EDGE_WEIGHT = 20;
        const PASS_WEIGHT = 0;
        const SMASH_WEIGHT = 100;

        // nab.on('message', (did: SmashDID, message: any) => {
        //     console.log(
        //         `> ${did.ik} sent message:`,
        //         JSON.stringify(message, null, 2),
        //     );
        // });

        nab.on('join', async (did: SmashDID) => {
            console.log(`> ${did.ik} joined`);
            const node = graph.add({ group: 'nodes', data: { id: did.ik } });
            users.push({ did: did, score: 0, node });

            // Add weak connections to all existing users
            users.forEach((existingUser) => {
                if (existingUser.did.ik !== did.ik) {
                    graph.add({
                        group: 'edges',
                        data: {
                            source: did.ik,
                            target: existingUser.did.ik,
                            weight: DEFAULT_EDGE_WEIGHT,
                        },
                    });
                }
            });

            await sendUsersToSession(did);
        });

        nab.on(
            'action',
            async (
                sender: SmashDID,
                action: { target: SmashDID; action: string },
            ) => {
                let weight = DEFAULT_EDGE_WEIGHT;

                switch (action.action) {
                    case 'smash':
                        weight = SMASH_WEIGHT;
                        break;
                    case 'pass':
                        weight = PASS_WEIGHT;
                        break;
                    case 'clear':
                        weight = DEFAULT_EDGE_WEIGHT;
                        break;
                    default:
                        console.warn(`Unknown action: ${action.action}`);
                        return;
                }

                const edge = graph
                    .edges()
                    .filter(
                        (e) =>
                            e.data('source') === sender.ik &&
                            e.data('target') === action.target.ik,
                    );

                if (edge.length > 0) {
                    edge.data('weight', weight);
                } else {
                    graph.add({
                        group: 'edges',
                        data: {
                            source: sender.ik,
                            target: action.target.ik,
                            weight: weight,
                        },
                    });
                }

                const pageRank = graph.elements().pageRank({});
                for (const user of users) {
                    user.score = pageRank.rank(user.node);
                }

                // Notify all users about the updated graph
                for (const user of users) {
                    await sendUsersToSession(user.did);
                }
            },
        );

        // Graph visualization endpoint [DEV]
        const app = express();
        app.get('/', (_, res: Response) => {
            res.setHeader('Content-Type', 'text/html');
            const graphStr = JSON.stringify((graph.json() as any)['elements']);
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
                  }
                });
                </script>
              </body>
          `);
        });
        const port = 3030;
        app.listen(port, () => {
            console.log(`>>> open users graph at http://localhost:${port}`);
        });
    });
}

start();
