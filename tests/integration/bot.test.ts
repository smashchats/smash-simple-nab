import {
    SMEConfig,
    SME_DEFAULT_CONFIG,
    SmashActionJson,
    SmashDID,
    SmashMessaging,
    SmashProfile,
    SmashUser,
} from 'smash-node-lib';

import { Bot } from '../../src/bot.js';
import { socketServerUrl } from '../jest.global.cjs';

const waitFor = (peer: SmashMessaging, event: string) => {
    return new Promise((resolve) => peer.once(event, resolve));
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('NAB integration testing', () => {
    beforeAll(() => {
        SmashMessaging.setCrypto(global.crypto);
    });

    afterAll(async () => {
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
        await delay(1000);
    });

    afterEach(async () => {
        await bot?.stop();
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
        const user = new SmashUser(
            await SmashMessaging.generateIdentity(),
            '',
            'INFO',
            'User',
        );
        await userJoin(user);
        expect(Object.values(bot!.profiles).length).toBe(1);
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
            ) as Promise<SmashProfile[]>;
            await alice.discover();
            const profiles = await waitForDiscover;
            const findProfile = (did: SmashDID) => profiles.find((p) => p.did.ik === did.ik)?.scores?.score;
            return {
                bob: findProfile(bobDid),
                charlie: findProfile(charlieDid),
                darcy: findProfile(darcyDid),
            };
        };

        beforeEach(async () => {
            alice = new SmashUser(
                await SmashMessaging.generateIdentity(),
                '',
                'DEBUG',
                'Alice',
            );
            bob = new SmashUser(
                await SmashMessaging.generateIdentity(),
                '',
                'DEBUG',
                'Bob',
            );
            charlie = new SmashUser(
                await SmashMessaging.generateIdentity(),
                '',
                'DEBUG',
                'Charlie',
            );
            darcy = new SmashUser(
                await SmashMessaging.generateIdentity(),
                '',
                'DEBUG',
                'Darcy',
            );

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
            expect(Object.values(bot!.profiles).length).toBe(NB_USERS);
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
                await alice.pass(bobDid);
            });

            it('should decrease Bobs score for Alice', async () => {
                const scores = await getAliceGrid();
                expect(scores.bob).toBeLessThan(initialScores.bob!);
                expect(scores.bob).toBeLessThan(scores.charlie!);
                expect(scores.bob).toBeLessThan(scores.darcy!);
            });

            // describe('Bob smashing Charlie', () => {
            //     beforeEach(async () => {
            //         await bob.smash(charlieDid);
            //     });

            //     it('should increase Charlies for Alice', async () => {
            //         const scores = await getAliceGrid();
            //         expect(scores.charlie).toBeGreaterThan(
            //             initialScores.charlie!,
            //         );
            //         expect(scores.charlie).toBeGreaterThan(scores.darcy!);
            //         expect(scores.bob).toBeGreaterThan(scores.darcy!);
            //     });
            // });
        });
    });
});
