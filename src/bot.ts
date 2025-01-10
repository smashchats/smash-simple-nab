import 'dotenv/config';
import type {
    DIDDocument,
    DIDString,
    IMPeerIdentity,
    IMProfile,
    IMProfileMessage,
    ISO8601,
    LogLevel,
    Logger,
    Relationship,
    SMEConfigJSONWithoutDefaults,
    SmashProfileList,
    sha256,
} from 'smash-node-lib';
import { IM_PROFILE, SmashNAB } from 'smash-node-lib';

import SocialGraph from './graph.js';

// TODO persist (file?): signal sessions, users graph (state),

export class Bot extends SmashNAB {
    protected graph: SocialGraph;

    public readonly users = new Map<DIDString, DIDDocument>();
    public readonly profiles = new Map<
        DIDString,
        Partial<Omit<IMProfile, 'avatar'>>
    >();
    public readonly relationships = new Map<
        DIDString,
        Map<
            DIDString,
            {
                time: Date;
                state: Relationship;
            }
        >
    >();

    constructor(
        identity: IMPeerIdentity,
        name: string = 'NAB',
        logLevel = 'INFO' as LogLevel,
    ) {
        super(identity, name, logLevel);
        this.graph = new SocialGraph(this.getLogger());
        // TODO add itself to the graph??
        this.on(IM_PROFILE, (did: DIDString, profile: IMProfileMessage) => {
            this.logger.debug(`> ${did} updated their profile`);
            this.updateStoredProfile(did, profile.data);
        });
    }

    public async printJoinInfo(smes: SMEConfigJSONWithoutDefaults[] = []) {
        const joinInfo = await this.getJoinInfo(smes);
        this.logger.info('JOIN INFO:');
        this.logger.info(JSON.stringify(joinInfo));
    }

    // TODO support multiple distances/scores
    // TODO personalized to requesting user
    private discoverUsersFor(): SmashProfileList {
        return this.graph
            .getScores()
            .filter((node) => this.users.get(node.id)?.id)
            .map((node) => ({
                did: this.users.get(node.id)!,
                meta: this.profiles.get(node.id),
                scores: { score: node.score },
            }));
    }

    public async stop() {
        await this.close();
    }

    async onJoin(didDocument: DIDDocument) {
        const id: DIDString = didDocument.id;
        this.relationships.set(id, new Map(this.relationships.get(id) ?? []));
        this.updateStoredDID(id, didDocument);
        this.graph.getOrCreate(id);
        this.logger.debug(`> ${id} joined`);
    }

    async onDiscover(fromDID: DIDString): Promise<SmashProfileList> {
        this.logger.debug(`> discovery ${fromDID}`);
        if (this.users.get(fromDID)?.id) {
            return this.discoverUsersFor();
        } else {
            this.logger.error(
                `cannot send profiles to ${fromDID} because they are not registered`,
            );
            throw new Error(
                `cannot send profiles to ${fromDID} because they are not registered`,
            );
        }
    }

    async onRelationship(
        fromDID: DIDString,
        toDID: DIDString,
        relationship: Relationship,
        _messageHash?: sha256,
        timestamp?: ISO8601,
    ) {
        const time = new Date(timestamp!);
        if (fromDID === toDID) {
            return this.logger.info(
                `> ignoring self ${relationship} from ${fromDID}`,
            );
        }
        this.logger.debug(
            `> ${fromDID} --> ${relationship} --> ${toDID} (${time.toLocaleTimeString()})`,
        );
        const currentState = this.relationships.get(fromDID)?.get(toDID);
        if (currentState && currentState.time > time) {
            return this.logger.debug(
                `current state (${currentState.state}) is newer (${currentState.time.toLocaleString()})`,
            );
        } else {
            if (!this.relationships.has(fromDID)) {
                this.relationships.set(fromDID, new Map());
            }
            this.relationships.get(fromDID)!.set(toDID, {
                state: relationship,
                time,
            });
        }
        switch (relationship) {
            case 'smash':
                this.graph.connectDirected(fromDID, toDID);
                break;
            case 'pass':
            case 'block':
                this.graph.disconnectDirected(fromDID, toDID);
                break;
            case 'clear':
                this.graph.resetEdges(fromDID, toDID);
                break;
            default:
                this.logger.warn(
                    `unknown relationship! (${relationship as never} from ${fromDID})`,
                );
        }
    }

    private updateStoredDID(id: DIDString, did: DIDDocument) {
        this.users.set(id, { ...this.users.get(id), ...did });
        this.logger.debug(`> ${id} updated their DID (${this.users.size})`);
        this.logger.debug(JSON.stringify(this.users.get(id)));
    }

    private updateStoredProfile(
        id: DIDString,
        partialProfile: Partial<IMProfile>,
    ) {
        // do not store the base64 profile picture for now (performance/efficiency)
        // 1. later, this should be replaced with proper distributed storage
        // 2. full profile will be sent directly from peer to peer
        delete partialProfile.avatar;
        // update DID document with directly shared, IF full doc is present
        if (partialProfile.did && typeof partialProfile.did === 'object') {
            this.updateStoredDID(id, partialProfile.did);
        }
        // complete stored profile with shared data (ASSUMING IT'S PUBLIC!)
        this.profiles.set(id, {
            ...(this.profiles.get(id) ?? {}),
            ...partialProfile,
        });
        this.logger.debug(`> ${id} updated their profile`);
        this.logger.debug(JSON.stringify(this.profiles.get(id)));
    }

    public getLogger(): Logger {
        return this.logger;
    }
}
