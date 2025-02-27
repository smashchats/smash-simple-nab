import {
    DID,
    DIDDocManager,
    Logger,
    NBH_PROFILE_LIST,
    SMASH_NBH_JOIN,
    SMEConfig,
    SME_DEFAULT_CONFIG,
    SmashActionJson,
    SmashMessaging,
    SmashProfileList,
    SmashUser,
} from 'smash-node-lib';

import { Bot } from '../../src/bot.js';
import { SME_PUBLIC_KEY, socketServerUrl } from '../jest.global.cjs';
import { aliasWaitFor, delay } from './utils.js';

describe('NAB integration testing', () => {
    let didDocManager: DIDDocManager;
    const logger = new Logger('bot.test', 'DEBUG');
    const waitForEventCancelFns: (() => void)[] = [];
    const waitFor = aliasWaitFor(waitForEventCancelFns, logger);

    beforeAll(() => {
        SmashMessaging.setCrypto(global.crypto);
        didDocManager = new DIDDocManager();
        SmashMessaging.use(didDocManager);
    });

    afterAll(async () => {
        await delay(500);
    });

    let bot: Bot | undefined;
    let joinInfoWithSME: SmashActionJson | undefined;

    beforeEach(async () => {
        const botIdentity = await didDocManager.generate();
        const preKeyPair =
            await didDocManager.generateNewPreKeyPair(botIdentity);
        bot = new Bot(botIdentity, 'TestNAB', 'DEBUG');
        const SME_CONFIG: SMEConfig = {
            ...SME_DEFAULT_CONFIG,
            url: socketServerUrl,
            smePublicKey: SME_PUBLIC_KEY,
            preKeyPair,
        };
        await bot.endpoints.connect(SME_CONFIG, preKeyPair);
        await bot.printJoinInfo([SME_CONFIG]);
        joinInfoWithSME = await bot.getJoinInfo([SME_CONFIG]);
    }, 10000);

    let user: SmashUser | undefined;

    afterEach(async () => {
        logger.debug('>> closing users and canceling all waiters');
        await Promise.all([
            bot?.stop(),
            user?.close(),
            ...waitForEventCancelFns.map((cancel) => cancel()),
        ]);
        waitForEventCancelFns.length = 0;
        logger.debug('>> resetting mocks');
        jest.resetAllMocks();
        bot = undefined;
        joinInfoWithSME = undefined;
    }, 10000);

    it('a new user can join the neighborhood', async () => {
        user = new SmashUser(await didDocManager.generate(), 'User', 'INFO');
        const waitForBotJoinEvent = waitFor(bot!, SMASH_NBH_JOIN);
        await user.join(joinInfoWithSME!);
        await waitForBotJoinEvent;
        await delay(500);
        expect(bot?.users.size).toBe(1);
    });

    describe('four users (alice, bob, charlie, darcy)', () => {
        let alice: SmashUser;
        let bob: SmashUser;
        let charlie: SmashUser;
        let darcy: SmashUser;

        beforeEach(async () => {
            [alice, bob, charlie, darcy] = await Promise.all([
                didDocManager
                    .generate()
                    .then((did) => new SmashUser(did, 'Alice', 'DEBUG')),
                didDocManager
                    .generate()
                    .then((did) => new SmashUser(did, 'Bob', 'DEBUG')),
                didDocManager
                    .generate()
                    .then((did) => new SmashUser(did, 'Charlie', 'DEBUG')),
                didDocManager
                    .generate()
                    .then((did) => new SmashUser(did, 'Darcy', 'DEBUG')),
            ]);

            const allFourUsersJoined = waitFor(bot!, SMASH_NBH_JOIN, {
                count: 4,
                timeout: 12000,
            });

            await alice.join(joinInfoWithSME!);
            await bob.join(joinInfoWithSME!);
            await charlie.join(joinInfoWithSME!);
            await darcy.join(joinInfoWithSME!);

            await allFourUsersJoined;
            await delay(500);

            const diddocs = await Promise.all([
                alice.getDIDDocument(),
                bob.getDIDDocument(),
                charlie.getDIDDocument(),
                darcy.getDIDDocument(),
            ]);

            diddocs.forEach(didDocManager.set.bind(didDocManager));
        }, 20000);

        afterEach(async () => {
            await Promise.all([
                alice.close(),
                bob.close(),
                charlie.close(),
                darcy.close(),
            ]);
        }, 20000);

        it('can join all four users', async () => {
            expect(bot!.users.size).toBe(4);
        });

        const getAliceGrid = async () => {
            const waitForDiscover = (
                new Promise((resolve) =>
                    alice.once(
                        NBH_PROFILE_LIST,
                        async (_, profiles: SmashProfileList) =>
                            resolve(profiles),
                    ),
                ) as Promise<SmashProfileList>
            ).then();
            await alice.discover();
            const profiles = await waitForDiscover;
            logger.debug('profiles', JSON.stringify(profiles, null, 2));
            const didURL = (did: DID) =>
                typeof did === 'string' ? did : did.id;
            const compareDID = (did1: DID, did2: DID) =>
                didURL(did1) === didURL(did2);
            const findUserScore = (user: SmashUser) =>
                profiles.find((p) => compareDID(p.did, user.did))?.scores
                    ?.score;
            return {
                bob: findUserScore(bob),
                charlie: findUserScore(charlie),
                darcy: findUserScore(darcy),
            };
        };

        describe('scores discovery', () => {
            let initialScores: {
                bob: number | undefined;
                charlie: number | undefined;
                darcy: number | undefined;
            };

            beforeEach(async () => {
                await delay(100);
                initialScores = await getAliceGrid();
                await delay(100);
            }, 10000);

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
                    await alice.smash(bob.did);
                    await delay(1000);
                });

                it('should increase Bobs score for Alice', async () => {
                    const scores = await getAliceGrid();
                    expect(scores.bob).toBeGreaterThan(initialScores.bob!);
                    expect(scores.bob).toBeGreaterThan(scores.charlie!);
                    expect(scores.bob).toBeGreaterThan(scores.darcy!);
                });

                describe('Bob smashing Charlie', () => {
                    beforeEach(async () => {
                        await bob.smash(charlie.did);
                        await delay(1000);
                    });

                    it('should increase Charlies for Alice', async () => {
                        const scores = await getAliceGrid();
                        expect(scores.charlie).toBeGreaterThan(
                            initialScores.charlie!,
                        );
                        expect(scores.charlie).toBeGreaterThan(scores.darcy!);
                        expect(scores.bob).toBeGreaterThan(scores.darcy!);
                    });
                });
            });

            describe('Alice passing Bob', () => {
                beforeEach(async () => {
                    await alice.pass(bob.did);
                    await delay(1000);
                });

                it('should decrease Bobs score for Alice', async () => {
                    const scores = await getAliceGrid();
                    expect(scores.bob).toBeLessThan(initialScores.bob!);
                    expect(scores.bob).toBeLessThan(scores.charlie!);
                    expect(scores.bob).toBeLessThan(scores.darcy!);
                });
            });
        });
    });
});
