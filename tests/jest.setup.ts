import { Logger, SmashMessaging } from 'smash-node-lib';

const logger = new Logger('jest', 'INFO');
jest.setTimeout(12000);

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
