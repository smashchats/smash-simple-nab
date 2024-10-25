import cytoscape from 'cytoscape';
import 'dotenv/config';
import {
    Identity,
    SMEConfig,
    SMEConfigJSONWithoutDefaults,
    SmashDID,
    SmashNAB,
} from 'smash-node-lib';

export class Bot {
    public readonly nab: SmashNAB;
    public readonly users: {
        did: SmashDID;
        score: number;
        node: cytoscape.CollectionReturnValue;
    }[];

    protected graph: cytoscape.Core;

    constructor(identity: Identity) {
        this.graph = cytoscape();
        this.nab = new SmashNAB(identity, 'LOG');
        this.users = [];
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
    }

    public async stop() {
        await this.nab.close();
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
}
