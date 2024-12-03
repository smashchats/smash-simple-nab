// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createServer } = require('node:http');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Server } = require('socket.io');

const PORT = 12345;
const URL = `http://localhost:${PORT}`;

const subtle = globalThis.crypto.subtle;

const ENCODING = 'base64';
const EXPORTABLE = 'spki';
const exportKey = async (key, encoding = ENCODING) =>
    Buffer.from(await subtle.exportKey(EXPORTABLE, key)).toString(encoding);

const importKey = async (
    keyEncoded,
    keyAlgorithm,
    exportable = true,
    usages = [],
    encoding = ENCODING,
) =>
    await subtle.importKey(
        EXPORTABLE,
        Buffer.from(keyEncoded, encoding),
        keyAlgorithm,
        exportable,
        usages,
    );

const importClientPublicKey = async (socket) =>
    await importKey(
        socket.handshake.auth.key,
        socket.handshake.auth.keyAlgorithm,
    );

module.exports = async function () {
    return new Promise((resolve) => {
        const activeSockets = {};
        const httpServer = createServer();
        const socketServer = new Server(httpServer);
        socketServer.on('connection', async (client) => {
            const auth = !!client.handshake.auth.key;
            const clientPublicKey = auth
                ? await importClientPublicKey(client)
                : undefined;
            const clientKeyId = auth
                ? await exportKey(clientPublicKey)
                : 'ANONYMOUS';
            activeSockets[clientKeyId] = client;
            client.on('data', async (peerId, sessionId, data, acknowledge) => {
                Object.keys(activeSockets)
                    .filter((key) => peerId === key)
                    .forEach((key) =>
                        activeSockets[key].emit('data', sessionId, data),
                    );
                acknowledge();
            });
            client.on('disconnect', () => {
                delete activeSockets[clientKeyId];
            });
        });
        httpServer.listen(PORT, () => {
            globalThis.__socketServer = socketServer;
            resolve(void 0);
        });
    });
};

module.exports.socketServerUrl = URL;
