import { createServer } from 'http';
import { AddressInfo } from 'net';
import {
    Logger,
    SMEConfig,
    SME_DEFAULT_CONFIG,
    SmashActionJson,
    SmashDID,
    SmashMessaging,
    SmashUser,
} from 'smash-node-lib';
import { Server, Socket } from 'socket.io';

import { Bot } from '../../src/bot.js';

const waitFor = (peer: SmashMessaging, event: string) => {
    return new Promise((resolve) => peer.once(event, resolve));
};

const logger = new Logger('jest', 'INFO');
jest.setTimeout(10000);

beforeAll(() => {
    console.log('>>> removing unhandledRejection listeners <<<');
    (process as any).actual.removeAllListeners('unhandledRejection');
});

beforeEach(() => {
    (process as any).actual.on(
        'unhandledRejection',
        (reason: any, promise: Promise<any>) => {
            SmashMessaging.handleError(reason, promise, logger);
        },
    );
});

describe('NAB integration testing', () => {
    let ioServer: Server;
    let socketServerUrl: string;
    let activeSockets: Socket[] = [];
    let onSMEDataEvent: jest.Mock;
    let handleServerData: (
        socket: Socket,
        peerId: string,
        sessionId: string,
        data: any,
    ) => Promise<void>;

    beforeAll((done) => {
        SmashMessaging.setCrypto(global.crypto);
        const httpServer = createServer();
        ioServer = new Server(httpServer);
        ioServer.on('connection', async (client: Socket) => {
            activeSockets.push(client);
            client.on('data', async (peerId, sessionId, data, acknowledge) => {
                await handleServerData(client, peerId, sessionId, data);
                acknowledge();
            });
        });
        httpServer.listen(() => {
            const port = (httpServer.address() as AddressInfo).port;
            socketServerUrl = `http://localhost:${port}`;
            done();
        });
        onSMEDataEvent = jest.fn();
        handleServerData = async (socket, peerId, sessionId, data) => {
            onSMEDataEvent(peerId, sessionId, data);
            activeSockets
                .filter((client) => client.id !== socket.id)
                .forEach((client) => client.emit('data', sessionId, data));
        };
    });

    const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

    afterAll(async () => {
        await ioServer.close();
        // wait async operations to close
        await delay(500);
    });

    let bot: Bot | undefined;
    let joinInfoWithSME: SmashActionJson | undefined;

    beforeEach(async () => {
        const botIdentity = await SmashMessaging.generateIdentity();
        bot = new Bot(botIdentity);
        const SME_CONFIG: SMEConfig = {
            ...SME_DEFAULT_CONFIG,
            url: socketServerUrl,
            smePublicKey: 'dummyKey',
            preKeyPair: botIdentity.signedPreKeys[0],
        };
        await bot.initEndpoints([SME_CONFIG]);
        await bot.start();
        joinInfoWithSME = await bot.nab.getJoinInfo([SME_CONFIG]);
    });

    afterEach(async () => {
        activeSockets.forEach((socket) => socket.disconnect());
        await bot?.stop();
        activeSockets = [];
        jest.resetAllMocks();
        bot = undefined;
        joinInfoWithSME = undefined;
    });

    const userJoin = async (user: SmashUser) => {
        const waitForBotJoinEvent = waitFor(bot!.nab, 'join');
        await user.join(joinInfoWithSME!);
        await waitForBotJoinEvent;
    };

    it('a new user can join the neighborhood', async () => {
        const user = new SmashUser(await SmashMessaging.generateIdentity());
        await userJoin(user);
        expect(bot!.users.length).toBe(1);
        await user.close();
    });

    describe('four users (alice, bob, charlie, darcy)', () => {
        let alice: SmashUser;
        let bob: SmashUser;
        let charlie: SmashUser;
        let darcy: SmashUser;

        const NB_USERS = 4;

        let bobDid: SmashDID;
        let charlieDid: SmashDID;
        let darcyDid: SmashDID;

        let initialScores: {
            bob: number | undefined;
            charlie: number | undefined;
            darcy: number | undefined;
        };

        const getAliceGrid = async () => {
            const waitForDiscover = new Promise((resolve) =>
                alice.once('nbh_profiles', async (_, profiles) =>
                    resolve(profiles),
                ),
            ) as Promise<{ did: SmashDID; score: number }[]>;
            await alice.discover();
            const profiles = await waitForDiscover;
            return {
                bob: profiles.find((p) => p.did.ik === bobDid.ik)?.score,
                charlie: profiles.find((p) => p.did.ik === charlieDid.ik)
                    ?.score,
                darcy: profiles.find((p) => p.did.ik === darcyDid.ik)?.score,
            };
        };

        beforeEach(async () => {
            alice = new SmashUser(await SmashMessaging.generateIdentity());
            bob = new SmashUser(await SmashMessaging.generateIdentity());
            charlie = new SmashUser(await SmashMessaging.generateIdentity());
            darcy = new SmashUser(await SmashMessaging.generateIdentity());

            bobDid = await bob.getDID();
            charlieDid = await charlie.getDID();
            darcyDid = await darcy.getDID();

            await userJoin(alice);
            await userJoin(bob);
            await userJoin(charlie);
            await userJoin(darcy);

            initialScores = await getAliceGrid();
        });

        afterEach(async () => {
            await alice.close();
            await bob.close();
            await charlie.close();
            await darcy.close();
        });

        it('can join', async () => {
            expect(bot!.users.length).toBe(NB_USERS);
        });

        it('can discover each others through the NAB', () => {
            expect(initialScores.bob).toBeDefined();
            expect(initialScores.charlie).toBeDefined();
            expect(initialScores.darcy).toBeDefined();
        });

        it('two users have the same default score', () => {
            expect(initialScores.bob).toEqual(initialScores.charlie);
            expect(initialScores.bob).toEqual(initialScores.darcy);
            expect(initialScores.charlie).toEqual(initialScores.darcy);
        });

        describe('Alice smashing Bob', () => {
            beforeEach(async () => {
                await alice.smash(bobDid);
            });

            it('should increase Bobs score for Alice', async () => {
                const scores = await getAliceGrid();
                logger.info(`scores: ${JSON.stringify(scores)}`);
                expect(scores.bob).toBeGreaterThan(initialScores.bob!);
                expect(scores.bob).toBeGreaterThan(scores.charlie!);
                expect(scores.bob).toBeGreaterThan(scores.darcy!);
            });

            describe('Bob smashing Charlie', () => {
                beforeEach(async () => {
                    await bob.smash(charlieDid);
                });

                it('should increase Charlies for Alice', async () => {
                    const scores = await getAliceGrid();
                    logger.info(`scores: ${JSON.stringify(scores)}`);
                    expect(scores.charlie).toBeGreaterThan(
                        initialScores.charlie!,
                    );
                    expect(scores.charlie).toBeGreaterThan(scores.darcy!);
                    // expect(scores.bob).toBeGreaterThan(scores.charlie!);
                });
            });
        });

        // test('smashing', async () => {
        //     const joinInfo = await bot.nab.getJoinInfo();
        //     const aliceIdentity = await SmashMessaging.generateIdentity();
        //     const alice = new SmashUser(aliceIdentity);
        //     const bobIdentity = await SmashMessaging.generateIdentity();
        //     const bob = new SmashUser(bobIdentity);
        //     const waitForAliceToJoin = waitFor(bot.nab, 'action');
        //     await alice.join(joinInfo);
        //     await waitForAliceToJoin;
        //     const waitForBobToJoin = waitFor(bot.nab, 'action');
        //     await bob.join(joinInfo);
        //     await waitForBobToJoin;
        //     expect(bot.users.length).toBe(2);

        //     // DISCOVER BEFORE SMASHING: scores should low
        //     // DISCOVER AFTER SMASHING: scores should higher
        // SECOND DEGREE SMASHING: should increase score
        // });
    });
});
