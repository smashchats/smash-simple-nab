import { Logger, SmashMessaging } from 'smash-node-lib';

const logger = new Logger('jest', 'INFO');
jest.setTimeout(12000);

type Process = NodeJS.Process & { actual: NodeJS.Process };

beforeAll(() => {
    console.log('>>> removing unhandledRejection listeners <<<');
    (process as Process).actual.removeAllListeners('unhandledRejection');
});

beforeEach(() => {
    (process as Process).actual.on(
        'unhandledRejection',
        (reason: unknown, promise: Promise<unknown>) => {
            SmashMessaging.handleError(reason, promise, logger);
        },
    );
});
