import cytoscape from 'cytoscape';
import 'dotenv/config';
import express, { Response } from 'express';
import {
    Identity,
    SMEConfig,
    SMEConfigJSONWithoutDefaults,
    SmashDID,
    SmashNAB,
} from 'smash-node-lib';

export class Bot {
    private nab: SmashNAB;
    private users: {
        did: SmashDID;
        score: number;
        node: cytoscape.CollectionReturnValue;
    }[] = [];
    private graph: cytoscape.Core;

    constructor(identity: Identity) {
        this.graph = cytoscape();
        this.nab = new SmashNAB(identity, 'LOG');
    }

    public async initEndpoints(smes: SMEConfig[]) {
        await this.nab.initEndpoints(smes);
        await this.printJoinInfo(smes);
    }

    public async printJoinInfo(smes: SMEConfigJSONWithoutDefaults[] = []) {
        const joinInfo = await this.nab.getJoinInfo(smes);
        console.log('JOIN INFO:');
        console.log(JSON.stringify(joinInfo));
    }

    private exportUsers() {
        return this.users.map((user) => ({ ...user, node: undefined }));
    }

    private async sendUsersToSession(did: SmashDID) {
        await this.nab.sendMessage(did, {
            type: 'profiles',
            data: this.exportUsers(),
        });
    }

    private async refreshGraphScores() {
        const pageRank = this.graph.elements().pageRank({});
        for (const user of this.users) user.score = pageRank.rank(user.node);
        console.log(
            `notifying ${this.users.length} users of the updated graph.`,
        );
        for (const user of this.users) {
            await this.sendUsersToSession(user.did);
        }
    }

    public async start() {
        this.setupEventListeners();
        this.setupGraphVisualization();
    }

    private setupEventListeners() {
        const DEFAULT_EDGE_WEIGHT = 20;
        const SMASH_WEIGHT = 100;

        this.nab.on('join', async (did: SmashDID) => {
            console.log(`> ${did.ik} joined`);
            const node = this.graph.add({
                group: 'nodes',
                data: { id: did.ik },
            });
            this.users.push({ did: did, score: 0, node });

            console.log(
                `Adding user ${did.ik} to the graph with weak connections.`,
            );

            this.users.forEach((existingUser) => {
                if (existingUser.did.ik !== did.ik) {
                    this.graph.add({
                        group: 'edges',
                        data: {
                            source: did.ik,
                            target: existingUser.did.ik,
                            weight: DEFAULT_EDGE_WEIGHT,
                        },
                    });
                }
            });

            await this.refreshGraphScores();
        });

        this.nab.on(
            'action',
            async (
                sender: SmashDID,
                action: { target: SmashDID; action: string },
            ) => {
                if (action.action === 'pass') {
                    // TODO: remove edge
                } else {
                    const weight =
                        action.action === 'smash'
                            ? SMASH_WEIGHT
                            : DEFAULT_EDGE_WEIGHT;
                    const edge = this.graph
                        .edges()
                        .filter(
                            (e) =>
                                e.data('source') === sender.ik &&
                                e.data('target') === action.target.ik,
                        );
                    console.log(
                        `found edges ${sender.ik} -> ${action.target.ik}: ${edge.length}`,
                    );
                    if (edge.length > 0) {
                        console.log(`updating existing edge (${weight})`);
                        edge.data('weight', weight);
                    } else {
                        console.log(
                            `creating new edge between nodes (${weight})`,
                        );
                        this.graph.add({
                            group: 'edges',
                            data: {
                                source: sender.ik,
                                target: action.target.ik,
                                weight: weight,
                            },
                        });
                    }
                }
                await this.refreshGraphScores();
            },
        );
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
    }
}
