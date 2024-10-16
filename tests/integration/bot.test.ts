import { createServer } from 'http';
import { AddressInfo } from 'net';
import {
    SMEConfig,
    SME_DEFAULT_CONFIG,
    SmashMessaging,
    SmashUser,
} from 'smash-node-lib';
import { Server, Socket } from 'socket.io';

import { Bot } from '../../src/bot';

describe('NAB integration testing', () => {
    let bot: Bot;
    let user: SmashUser;
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

        // Start the bot
        await bot.start();

        // Set up a test user
        const userIdentity = await SmashMessaging.generateIdentity();
        user = new SmashUser(userIdentity);
    });

    afterEach(async () => {
        await user.close();
        await bot.stop();
        activeSockets = [];
        jest.restoreAllMocks();
    });

    test('User can join the neighborhood', async () => {
        const joinInfo = await bot.nab.getJoinInfo();
        const waitForBotJoinEvent = waitFor(bot.nab, 'join');
        await user.join(joinInfo);
        await waitForBotJoinEvent;
        expect(bot.users.length).toBe(1);
    });
});
