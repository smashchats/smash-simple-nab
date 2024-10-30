import cytoscape from 'cytoscape';
import 'dotenv/config';
import {
    ActionData,
    Identity,
    Logger,
    SMEConfig,
    SMEConfigJSONWithoutDefaults,
    SmashDID,
    SmashNAB,
} from 'smash-node-lib';

export const last4 = (str: string) =>
    str.substring(str.length - 6, str.length - 2);

const DEFAULT_EDGE_WEIGHT = 20;
const SMASH_EDGE_WEIGHT = 100;

export class Bot {
    public readonly nab: SmashNAB;
    public readonly users: {
        did: SmashDID;
        score: number;
        node: cytoscape.CollectionReturnValue;
    }[];

    protected graph: cytoscape.Core;
    protected logger: Logger;

    constructor(identity: Identity, name: string = 'NAB') {
        this.graph = cytoscape();
        this.nab = new SmashNAB(identity, 'INFO', name);
        this.users = [];
        this.logger = new Logger(name);
    }

    public async initEndpoints(smes: SMEConfig[]) {
        await this.nab.initEndpoints(smes);
        await this.printJoinInfo(smes);
    }

    public async printJoinInfo(smes: SMEConfigJSONWithoutDefaults[] = []) {
        const joinInfo = await this.nab.getJoinInfo(smes);
        this.logger.info('JOIN INFO:');
        this.logger.info(JSON.stringify(joinInfo));
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
        this.logger.debug(
            `notifying ${this.users.length} users of the updated graph.`,
        );
        // NOTE: pagerank does not account for the edge weight
        const pageRank = this.graph.elements().pageRank({});
        for (const user of this.users) user.score = pageRank.rank(user.node);
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

    private async handleDiscoverEvent(did: SmashDID) {
        this.logger.debug(`> discovery ${last4(did.ik)}`);
        await this.sendUsersToSession(did);
    }

    private async handleJoinEvent(did: SmashDID) {
        this.logger.debug(`> ${last4(did.ik)} joined`);
        const node = this.graph.add({
            group: 'nodes',
            data: { id: last4(did.ik) },
        });
        this.users.push({ did: did, score: 0, node });
        // Add default edges from new user to all existing users
        for (const existingUser of this.users) {
            if (existingUser.did.ik !== did.ik) {
                this.addEdge(did, existingUser.did);
                this.addEdge(existingUser.did, did);
            }
        }
        this.logger.debug(`User ${did.ik} added to the graph.`);
        await this.refreshGraphScores();
        // await this.sendUsersToSession(did);
    }

    private async handleActionEvent(sender: SmashDID, action: ActionData) {
        this.logger.debug(
            `${last4(sender.ik)} --> ${action.action} --> ${last4(action.target.ik)}`,
        );
        if (action.action === 'smash') {
            this.smash(sender, action.target);
        } else if (action.action === 'pass') {
            this.pass(sender, action.target);
        } else if (action.action === 'clear') {
            this.pass(sender, action.target);
            this.addEdge(sender, action.target);
        }
        await this.refreshGraphScores();
    }

    private pass(sender: SmashDID, target: SmashDID) {
        const existingEdges = this.getEdges(sender, target);
        existingEdges.forEach((edge) => {
            edge.remove();
        });
    }

    private smash(sender: SmashDID, target: SmashDID) {
        const existingEdges = this.getEdges(sender, target);
        if (existingEdges.length >= 2) {
            this.logger.info(
                `${existingEdges.length} edges found between ${last4(sender.ik)} and ${last4(target.ik)}`,
            );
            return;
        }
        if (existingEdges.length === 0) {
            this.addEdge(sender, target);
        }
        this.addEdge(sender, target, SMASH_EDGE_WEIGHT);
    }

    private getEdges(sender: SmashDID, target: SmashDID) {
        return this.graph
            .edges()
            .filter(
                (edge) =>
                    edge.data('source') === last4(sender.ik) &&
                    edge.data('target') === last4(target.ik),
            );
    }

    private addEdge(
        sender: SmashDID,
        target: SmashDID,
        weight: number = DEFAULT_EDGE_WEIGHT,
    ) {
        // existingEdges[0].data('weight', weight);
        this.graph.add({
            group: 'edges',
            data: {
                source: last4(sender.ik),
                target: last4(target.ik),
                weight,
            },
        });
    }
}
