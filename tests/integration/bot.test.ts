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

beforeAll(() =>
    (process as any).actual().removeAllListeners('unhandledRejection'),
);
beforeEach(() =>
    (process as any)
        .actual()
        .on('unhandledRejection', (reason: any, promise: Promise<any>) => {
            SmashMessaging.handleError(reason, promise, logger);
        }),
);

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

    afterAll(async () => {
        await ioServer.close();
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

    describe('two users', () => {
        it('can join', async () => {
            const ana = new SmashUser(await SmashMessaging.generateIdentity());
            const bob = new SmashUser(await SmashMessaging.generateIdentity());

            await userJoin(ana);
            await userJoin(bob);
            expect(bot!.users.length).toBe(2);
        });

        it('can discover each other through the NAB', async () => {
            const ana = new SmashUser(await SmashMessaging.generateIdentity());
            // const bob = new SmashUser(await SmashMessaging.generateIdentity());

            await userJoin(ana);
            // await userJoin(bob);

            // expect(bot!.users.length).toBe(2);

            const waitForDiscover = new Promise((resolve) =>
                ana.once('nbh_profiles', async (_, profiles) =>
                    resolve(profiles),
                ),
            ) as Promise<{ did: SmashDID; score: number }[]>;

            await ana.discover();

            const profiles = await waitForDiscover;
            expect(profiles.length).toBe(2);
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
