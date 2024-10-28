#!/usr/bin/env node
import readline from 'readline';
import {
    SmashActionJson,
    SmashDID,
    SmashMessaging,
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
    const user = new SmashUser(identity, 'INFO', name);
    const did = await user.getDID();
    user.on(
        'nbh_profiles',
        async (sender, profiles: { did: SmashDID; score: number }[]) => {
            console.log(
                `\n${name} discovered profiles from ${printDID(sender)}:`,
                ...(await Promise.all(
                    profiles
                        .toSorted((a, b) => b.score - a.score)
                        .map(
                            async (profile, index) =>
                                `\n${index + 1}. (${Math.round(profile.score * 100)}) ${printDID(profile.did)}`,
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

    await waitForEnter();

    const scenario = [
        {
            name: 'Join neighborhood',
            action: async () => {
                console.log('\nJoining neighborhood...');
                await Promise.all(
                    Object.values(users).map(({ user }) => user.join(joinInfo)),
                );
                console.log('All users joined the neighborhood');
            },
        },
        {
            name: 'Initial discovery',
            action: async () => {
                console.log('\nDiscovering profiles...');
                await Promise.all(
                    Object.values(users).map(({ user }) => user.discover()),
                );
            },
            after: async () => {
                // Wait for discovery responses
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
            },
        },
        {
            name: 'Charlie smashes Darcy',
            action: async () => {
                console.log('\nCharlie smashes Darcy...');
                await users.charlie.user.smash(users.darcy.did!);
            },
            after: async () => {
                await users.alice.user.discover();
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
        console.log(`\nSTEP: ${step.name}`);
        await waitForEnter();
        await step.action();
        if (step.after) {
            await step.after();
        }
        await delay(500);
    }

    console.log('\nTest complete! Cleaning up...');
    await Promise.all(Object.values(users).map(({ user }) => user.close()));
    rl.close();
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
