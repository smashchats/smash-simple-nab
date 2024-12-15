import 'dotenv/config';
import type {
    DID,
    DIDDocument,
    DIDString,
    IMProfile,
    ISO8601,
    Identity,
    Logger,
    Relationship,
    SMEConfigJSONWithoutDefaults,
    SmashChatProfileListMessage,
    SmashChatRelationshipData,
    SmashProfileList,
    sha256,
} from 'smash-node-lib';
import { DIDResolver, SmashNAB } from 'smash-node-lib';

import SocialGraph from './graph.js';

export const last4 = (base64str: string) => {
    const str = base64str.replaceAll('=', '');
    return str.substring(str.length - 4, str.length);
};
export type UserID = ReturnType<typeof last4>;

// TODO persist (file?): signal sessions, users graph (state),
// TODO handle session restart when invalid data (eg, lost context, refreshed keys)
export class Bot extends SmashNAB {
    protected graph: SocialGraph;

    public readonly profiles: Record<
        UserID,
        {
            did: DIDDocument;
            meta: Partial<Omit<IMProfile, 'avatar'>> | undefined;
        }
    > = {};
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
        meta: IMProfile | undefined = undefined,
    ) {
        super(identity, meta, logLevel, name);
        this.graph = new SocialGraph(this.getLogger());
        this.registerHooks();
        // TODO add itself to the graph??
    }

    public async printJoinInfo(smes: SMEConfigJSONWithoutDefaults[] = []) {
        const joinInfo = await this.getJoinInfo(smes);
        this.logger.info('JOIN INFO:');
        this.logger.info(JSON.stringify(joinInfo));
    }

    // TODO support multiple distances/scores
    private async sendUsersToSession(did: DIDDocument) {
        await this.sendMessage(did, {
            type: 'com.smashchats.profiles',
            data: this.graph.getScores().map((node) => ({
                ...this.profiles[node.id].meta,
                did: this.profiles[node.id].did,
                scores: { score: node.score },
            })) as SmashProfileList,
            after: '0',
        } as SmashChatProfileListMessage);
    }

    public async stop() {
        await this.close();
    }

    async onJoin(from: DIDString, did: DIDDocument) {
        const id: UserID = last4(from);
        this.logger.debug(`> ${id} joined`);
        this.relationships[id] = { ...this.relationships[id] };
        this.updateStoredDID(id, did);
        this.graph.getOrCreate(id);
    }

    async onDiscover(from: DIDString) {
        const id = last4(from);
        this.logger.debug(`> discovery ${id}`);
        await this.sendUsersToSession(this.profiles[id]!.did);
    }

    async onRelationship(
        from: DIDString,
        { target, action }: SmashChatRelationshipData,
        _: sha256,
        timeString: ISO8601,
    ) {
        const time = new Date(timeString);
        const id = last4(from) as UserID;
        const targetId = last4(target) as UserID;
        if (from === target)
            return this.logger.info(`> ignoring self ${action} from ${id}`);
        this.logger.debug(
            `> ${id} --> ${action} --> ${targetId} (${time.toLocaleTimeString()})`,
        );
        const currentState = this.relationships[id][targetId];
        if (currentState && currentState.time > time)
            return this.logger.debug(
                `current state (${currentState.state}) is newer (${currentState.time.toLocaleString()})`,
            );
        else
            this.relationships[id][targetId] = {
                state: action,
                time,
            };
        switch (action) {
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
                    `unknown action! (${action as never} from ${id})`,
                );
        }
    }

    private async updateStoredDID(id: UserID, did: DID) {
        this.profiles[id] = {
            did: await DIDResolver.resolve(did),
            meta: undefined,
        };
    }

    // private updateStoredProfile(
    //     id: UserID,
    //     partialProfile: Partial<IMProfile>,
    // ) {
    //     // do not store the base64 profile picture for now (performance/efficiency)
    //     // 1. later, this should be replaced with proper distributed storage
    //     // 2. full profile will be sent directly from peer to peer
    //     delete partialProfile.avatar;
    //     this.profiles[id].meta = {
    //         ...this.profiles[id].meta,
    //         ...partialProfile,
    //     };
    // }

    public getLogger(): Logger {
        return this.logger;
    }
}
