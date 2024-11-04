import 'dotenv/config';
import {
    ActionData,
    Identity,
    Logger,
    ProfileListSmashMessage,
    SMEConfig,
    SMEConfigJSONWithoutDefaults,
    SmashDID,
    SmashNAB,
    SmashProfile,
} from 'smash-node-lib';
import SocialGraph from './graph.js';

export const last4 = (str: string) => str.substring(str.length - 6, str.length - 2);
export type UserID = ReturnType<typeof last4>;

// TODO persist (file?): signal sessions, users graph (state), 
// TODO handle session restart when invalid data (eg, lost context, refreshed keys)
export class Bot {
    public readonly nab: SmashNAB;
    public readonly profiles: Record<UserID, SmashProfile> = {};
    protected graph: SocialGraph;
    private logger: Logger;

    constructor(
        identity: Identity,
        name: string = 'NAB',
        logLevel = 'DEBUG' as const,
    ) {
        this.nab = new SmashNAB(identity, undefined, 'INFO', name);
        this.logger = new Logger(name, logLevel);
        this.graph = new SocialGraph(this.logger);
        // TODO add itself to the graph??
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

    // TODO support multiple distances/scores
    private async sendUsersToSession(did: SmashDID) {
        await this.nab.sendMessage(did, {
            type: 'profiles',
            data: this.graph.getScores().map(node => ({
                ...this.profiles[node.id], scores: { score: node.score },
            })),
        } as ProfileListSmashMessage);
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
        this.nab.on('profile', this.handleProfileEvent.bind(this));
    }

    private handleProfileEvent(sender: SmashDID, profile: SmashProfile) {
        // TODO: expire after Xmn (offline unless refreshed)
        this.logger.debug(`> updating ${last4(sender.ik)} profile`);
        this.updateStoredProfile(last4(sender.ik), profile);
    }

    private async handleDiscoverEvent(did: SmashDID) {
        this.logger.debug(`> discovery ${last4(did.ik)}`);
        await this.sendUsersToSession(did);
    }

    private async handleJoinEvent(did: SmashDID) {
        this.logger.debug(`> ${last4(did.ik)} joined`);
        // TODO: await profile discovery in order to appear on the visible graph (?)
        this.updateStoredProfile(last4(did.ik), { did });
        this.graph.getOrCreate(last4(did.ik));
    }

    private async handleActionEvent(sender: SmashDID, action: ActionData) {
        if (sender.ik === action.target.ik)
            return this.logger.info(`> ignoring self ${action.action} from ${last4(sender.ik)}`);
        this.logger.debug(
            `> ${last4(sender.ik)} --> ${action.action} --> ${last4(action.target.ik)}`,
        );
        switch (action.action) {
            case 'smash':
                this.smash(sender, action.target);
                break;
            case 'pass':
            case 'block':
                this.pass(sender, action.target);
                break;
            case 'clear':
                this.clear(sender, action.target);
                break;
            default:
                this.logger.warn(`unknown action! (${action.action} from ${last4(sender.ik)})`)
        }
    }

    private updateStoredProfile(id: UserID, partialProfile: Partial<SmashProfile>) {
        this.profiles[id] = { ...this.profiles[id], ...partialProfile };
    }

    private pass(sender: SmashDID, target: SmashDID) {
        this.graph.disconnectDirected(
            last4(sender.ik),
            last4(target.ik),
        );
    }

    private smash(sender: SmashDID, target: SmashDID) {
        this.graph.connectDirected(
            last4(sender.ik),
            last4(target.ik),
        );
    }

    private clear(sender: SmashDID, target: SmashDID) {
        this.graph.resetEdges(
            last4(sender.ik),
            last4(target.ik),
        );
    }

}
