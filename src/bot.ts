import cytoscape from 'cytoscape';
import 'dotenv/config';
import {
    ActionData,
    Identity,
    SMEConfig,
    SMEConfigJSONWithoutDefaults,
    SmashDID,
    SmashNAB,
} from 'smash-node-lib';

export const last4 = (str: string) =>
    str.substring(str.length - 6, str.length - 2);

export class Bot {
    public readonly nab: SmashNAB;
    public readonly users: {
        did: SmashDID;
        score: number;
        node: cytoscape.CollectionReturnValue;
    }[];

    protected graph: cytoscape.Core;

    constructor(identity: Identity, name: string = 'NAB') {
        this.graph = cytoscape();
        this.nab = new SmashNAB(identity, 'INFO', name);
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
        // for (const user of this.users) {
        //     await this.sendUsersToSession(user.did);
        // }
    }

    public async start() {
        this.setupEventListeners();
    }

    public async stop() {
        await this.nab.close();
    }

    private setupEventListeners() {
        this.nab.on('join', this.handleJoinEvent.bind(this));
        this.nab.on('discover', this.handleDiscoverEvent.bind(this));
        this.nab.on('action', this.handleActionEvent.bind(this));
    }

    private async handleJoinEvent(did: SmashDID) {
        console.log(`> ${did.ik} joined`);
        const node = this.graph.add({
            group: 'nodes',
            data: { id: did.ik, short: last4(did.ik) },
        });
        this.users.push({ did: did, score: 0, node });

        console.log(`Adding user ${did.ik} to the graph.`);
        await this.refreshGraphScores();
        await this.sendUsersToSession(did);
    }

    private async handleDiscoverEvent(did: SmashDID) {
        console.log(`> discovery ${did.ik}`);
        await this.sendUsersToSession(did);
    }

    private async handleActionEvent(sender: SmashDID, action: ActionData) {
        console.log(
            `${sender.ik} --> ${action.action} --> ${action.target.ik}`,
        );
        if (action.action === 'smash') {
            this.graph.add({
                group: 'edges',
                data: {
                    source: sender.ik,
                    target: action.target.ik,
                    weight: 20,
                },
            });
        }
        await this.refreshGraphScores();
    }
}
