#!/usr/bin/env node
import readline from 'readline';
import {
    SmashActionJson,
    SmashDID,
    SmashMessaging,
    SmashProfile,
    SmashUser,
} from 'smash-node-lib';

import { last4 } from '../src/bot.js';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const waitForEnter = () => {
    return new Promise<void>((resolve) => {
        rl.question('Press ENTER to continue...', () => {
            resolve();
        });
    });
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type TestUser = {
    name: string;
    user: SmashUser;
    did?: SmashDID;
};

const DICT: Record<string, string> = {};
const printDID = (did: SmashDID) => {
    const key = last4(did.ik);
    if (!DICT[key]) DICT[key] = did.ik;
    return key;
};

async function createTestUser(name: string): Promise<TestUser> {
    const identity = await SmashMessaging.generateIdentity();
    const user = new SmashUser(identity, undefined, 'INFO', name);
    await user.updateMeta({ title: name, description: '', picture: '' });
    const did = await user.getDID();
    user.on(
        'nbh_profiles',
        async (sender, profiles: SmashProfile[]) => {
            console.log(
                `\n${name} discovered profiles from ${printDID(sender)}:`,
                ...(await Promise.all(
                    profiles
                        .toSorted((a, b) => b.scores!.score - a.scores!.score)
                        .map(
                            async (profile, index) =>
                                `\n${index + 1}. (${Math.round(profile.scores!.score * 100)}) ${printDID(profile.did)} (${profile.meta?.title})`,
                        ),
                )),
                '\n',
            );
        },
    );
    return { name, user, did };
}

async function main() {
    if (process.argv.length < 3) {
        console.error('Usage: npm run auto-test "<JOIN_INFO_JSON_STRING>"');
        process.exit(1);
    }

    SmashMessaging.setCrypto(crypto);

    const joinInfo: SmashActionJson = JSON.parse(process.argv[2]);
    console.log('Creating users...');

    const users: Record<string, TestUser> = {
        alice: await createTestUser('Alice'),
        bob: await createTestUser('Bob'),
        charlie: await createTestUser('Charlie'),
        darcy: await createTestUser('Darcy'),
    };

    console.log('\nCreated users:');
    for (const { name, did } of Object.values(users)) {
        console.log(`${name}: ${printDID(did!)}`);
    }

    console.log('\nRunning scripted scenario...');
    const scenario = [
        {
            name: 'All users join neighborhood',
            action: async () => {
                console.log('\nUsers are joining the neighborhood...');
                await Promise.all(
                    Object.values(users).map(({ user }) => user.join(joinInfo)),
                );
            },
            after: async () => {
                await delay(1000);
                console.log('All users joined the neighborhood!');
            },
        },
        {
            name: 'Initial discovery',
            action: async () => {
                console.log('\nDiscovering...');
                await Promise.all(
                    Object.values(users).map(({ user }) => user.discover()),
                );
            },
            after: async () => {
                await delay(1000);
            },
        },
        {
            name: 'Alice smashes Bob',
            action: async () => {
                console.log('\nAlice smashes Bob...');
                await users.alice.user.smash(users.bob.did!);
            },
            after: async () => {
                await users.alice.user.discover();
                await users.bob.user.discover();
            },
        },
        {
            name: 'Bob smashes Charlie',
            action: async () => {
                console.log('\nBob smashes Charlie...');
                await users.bob.user.smash(users.charlie.did!);
            },
            after: async () => {
                await users.alice.user.discover();
                await users.bob.user.discover();
                await users.charlie.user.discover();
            },
        },
        {
            name: 'Charlie smashes Darcy',
            action: async () => {
                console.log('\nCharlie smashes Darcy...');
                await users.charlie.user.smash(users.darcy.did!);
            },
            after: async () => {
                await users.charlie.user.discover();
            },
        },
        {
            name: 'Darcy passes Charlie',
            action: async () => {
                await users.darcy.user.pass(users.charlie.did!);
            },
            after: async () => {
                await users.alice.user.discover();
                await users.bob.user.discover();
                await users.charlie.user.discover();
                await users.darcy.user.discover();
            },
        },
        {
            name: 'Charlie passes Darcy',
            action: async () => {
                console.log('\nCharlie passes Darcy...');
                await users.charlie.user.pass(users.darcy.did!);
            },
            after: async () => {
                await users.charlie.user.discover();
            },
        },
        {
            name: 'Final discovery',
            action: async () => {
                console.log('\nFinal profile discovery...');
                await Promise.all(
                    Object.values(users).map(({ user }) => user.discover()),
                );
            },
        },
    ];

    for (const step of scenario) {
        console.log(`\n\nSTEP: ${step.name}`);
        await waitForEnter();
        await step.action();
        if (step.after) {
            await step.after();
        }
        await delay(1000);
    }

    console.log('\nTest complete!');
    await waitForEnter();
    console.log('\nCleaning up...');
    await Promise.all(Object.values(users).map(({ user }) => user.close()));
    rl.close();
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
