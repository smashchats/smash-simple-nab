import 'dotenv/config';
import {
    ActionData,
    Identity,
    Logger,
    ProfileListSmashMessage,
    Relationship,
    SMEConfig,
    SMEConfigJSONWithoutDefaults,
    SmashDID,
    SmashNAB,
    SmashProfile,
    SmashProfileMeta,
} from 'smash-node-lib';

import SocialGraph from './graph.js';

export const last4 = (str: string) =>
    str.substring(str.length - 6, str.length - 2);
export type UserID = ReturnType<typeof last4>;

// TODO persist (file?): signal sessions, users graph (state),
// TODO handle session restart when invalid data (eg, lost context, refreshed keys)
export class Bot {
    public readonly logger: Logger;

    public readonly nab: SmashNAB;
    protected graph: SocialGraph;

    public readonly profiles: Record<UserID, SmashProfile> = {};
    public readonly relationships: Record<
        UserID,
        Record<
            UserID,
            {
                time: Date;
                state: Relationship;
            }
        >
    > = {};

    constructor(
        identity: Identity,
        name: string = 'NAB',
        logLevel = 'DEBUG' as const,
        meta: SmashProfileMeta | undefined = undefined,
    ) {
        this.nab = new SmashNAB(identity, meta, 'INFO', name);
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
            data: this.graph.getScores().map((node) => ({
                ...this.profiles[node.id],
                scores: { score: node.score },
            })),
            after: '0',
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

    // TODO: await profile discovery in order to appear on the visible graph (?)
    private async handleJoinEvent(did: SmashDID) {
        const id: UserID = last4(did.ik);
        this.logger.debug(`> ${id} joined`);
        this.relationships[id] = { ...this.relationships[id] };
        this.updateStoredProfile(id, { did });
        this.graph.getOrCreate(id);
    }

    private async handleActionEvent(
        sender: SmashDID,
        action: ActionData,
        time: Date,
    ) {
        const id = last4(sender.ik) as UserID;
        const targetId = last4(action.target.ik) as UserID;
        if (sender.ik === action.target.ik)
            return this.logger.info(
                `> ignoring self ${action.action} from ${id}`,
            );
        this.logger.debug(
            `> ${id} --> ${action.action} --> ${last4(action.target.ik)} (${time.toLocaleTimeString()})`,
        );
        const currentState = this.relationships[id][last4(action.target.ik)];
        if (currentState && currentState.time > time)
            return this.logger.debug(
                `current state (${currentState.state}) is newer (${currentState.time.toLocaleString()})`,
            );
        else
            this.relationships[id][last4(action.target.ik)] = {
                state: action.action,
                time,
            };
        switch (action.action) {
            case 'smash':
                this.graph.connectDirected(id, targetId);
                break;
            case 'pass':
            case 'block':
                this.graph.disconnectDirected(id, targetId);
                break;
            case 'clear':
                this.graph.resetEdges(id, targetId);
                break;
            default:
                this.logger.warn(
                    `unknown action! (${action.action} from ${id})`,
                );
        }
    }

    private updateStoredProfile(
        id: UserID,
        partialProfile: Partial<SmashProfile>,
    ) {
        this.profiles[id] = { ...this.profiles[id], ...partialProfile };
    }
}
