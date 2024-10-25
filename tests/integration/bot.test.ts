import { createServer } from 'http';
import { AddressInfo } from 'net';
import {
    SMEConfig,
    SME_DEFAULT_CONFIG,
    SmashMessaging,
    SmashUser,
} from 'smash-node-lib';
import { Server, Socket } from 'socket.io';

import { Bot } from '../../src/bot.js';

describe('NAB integration testing', () => {
    let bot: Bot;
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

    const waitFor = (peer: SmashMessaging, event: string) => {
        return new Promise((resolve) => peer.once(event, resolve));
    };

    beforeAll((done) => {
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
    });

    afterAll(async () => {
        await ioServer.close();
    });

    beforeEach(async () => {
        onSMEDataEvent = jest.fn();
        handleServerData = async (socket, peerId, sessionId, data) => {
            onSMEDataEvent(peerId, sessionId, data);
            activeSockets
                .filter((client) => client.id !== socket.id)
                .forEach((client) => client.emit('data', sessionId, data));
        };

        // Create a new Bot instance
        SmashMessaging.setCrypto(global.crypto);
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
    });

    afterEach(async () => {
        await bot.stop();
        activeSockets.forEach((socket) => socket.disconnect());
        activeSockets = [];
        jest.restoreAllMocks();
    });

    test('A new user can join the neighborhood', async () => {
        const user = new SmashUser(await SmashMessaging.generateIdentity());
        const joinInfo = await bot.nab.getJoinInfo();
        const waitForBotJoinEvent = waitFor(bot.nab, 'join');
        await user.join(joinInfo);
        await waitForBotJoinEvent;
        expect(bot.users.length).toBe(1);
        await user.close();
    });

    describe('With multiple users', () => {
        test('discovering', async () => {
            const joinInfo = await bot.nab.getJoinInfo();
            const aliceIdentity = await SmashMessaging.generateIdentity();
            const alice = new SmashUser(aliceIdentity);
            const bobIdentity = await SmashMessaging.generateIdentity();
            const bob = new SmashUser(bobIdentity);
            const waitForAliceToJoin = waitFor(bot.nab, 'join');
            await alice.join(joinInfo);
            await waitForAliceToJoin;
            const waitForBobToJoin = waitFor(bot.nab, 'join');
            await bob.join(joinInfo);
            await waitForBobToJoin;
            expect(bot.users.length).toBe(2);
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
