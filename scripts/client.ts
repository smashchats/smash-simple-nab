#!/usr/bin/env node
import readline from 'readline';
import {
    SmashActionJson,
    SmashDID,
    SmashMessaging,
    SmashUser,
} from 'smash-node-lib';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

let user: SmashUser;
let nabDid: SmashDID;

SmashMessaging.setCrypto(crypto);
type Profile = { did: SmashDID; score: number };
const DICT: Record<string, string> = {};
const sha1 = async (str: string) =>
    Buffer.from(
        await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str)),
    ).toString('base64');
const printDID = async (did: SmashDID) => {
    const key = await sha1(did.ik);
    if (!DICT[key]) DICT[key] = did.ik;
    return key;
};
const getDID = (key: string) => DICT[key] || key;

const addDiscoverListener = (user: SmashUser, callback?: () => void) => {
    user.once('nbh_profiles', async (sender, profiles: Profile[]) => {
        console.log(
            '\n\n',
            `Discovered profiles (${await printDID(sender)}):`,
            ...(await Promise.all(
                profiles
                    .toSorted((a, b) => b.score - a.score)
                    .map(
                        async (profile, index) =>
                            `\n${index + 1}. (${Math.round(profile.score * 100)}) ${await printDID(profile.did)}`,
                    ),
            )),
            '\n',
        );
        callback?.();
    });
};

async function createUser(): Promise<SmashUser> {
    const identity = await SmashMessaging.generateIdentity();
    const user = new SmashUser(identity, 'LOG');
    user.on('message', (message) => {
        console.info('\n\nReceived message:', JSON.stringify(message, null, 2));
    });
    return user;
}

async function joinNeighborhood(): Promise<void> {
    rl.question('Enter NAB JOIN info (JSON string): ', async (joinInfoStr) => {
        try {
            const joinInfo: SmashActionJson = JSON.parse(joinInfoStr);
            addDiscoverListener(user, displayMenu);
            await user.join(joinInfo);
            nabDid = joinInfo.did;
            console.log(
                `Successfully queued request to join NBH ${await printDID(nabDid)}`,
            );
        } catch (error) {
            console.error('Error joining neighborhood:', error);
            displayMenu();
        }
    });
}

async function discoverProfiles(): Promise<void> {
    if (!nabDid) {
        console.log('Please join a neighborhood first.');
        displayMenu();
        return;
    }
    addDiscoverListener(user, displayMenu);
    await user.discover();
    console.log('Discovering profiles...');
}

async function performAction(
    action: 'smash' | 'pass' | 'clear',
): Promise<void> {
    if (!nabDid) {
        console.log('Please join a neighborhood first.');
        displayMenu();
        return;
    }

    rl.question(
        `Enter the DID (ik) of the target user to ${action}: `,
        async (targetIk) => {
            const targetDid: SmashDID = {
                ik: getDID(targetIk),
                ek: '',
                signature: '',
                endpoints: [],
            };
            await user[action](targetDid);
            console.log(
                `\n${action.charAt(0).toUpperCase() + action.slice(1)} queued.\n`,
            );
            setTimeout(displayMenu, 1000);
        },
    );
}

function displayMenu(): void {
    console.log('\n--- NBH Client Menu ---');
    console.log('1. Join Neighborhood');
    console.log('2. Discover Profiles');
    console.log('3. Smash');
    console.log('4. Pass');
    console.log('5. Clear');
    console.log('6. Show ID');
    console.log('7. Exit');
    rl.question('Select an option: ', handleMenuChoice);
}

async function handleMenuChoice(choice: string): Promise<void> {
    switch (choice) {
        case '1':
            await joinNeighborhood();
            break;
        case '2':
            await discoverProfiles();
            break;
        case '3':
            await performAction('smash');
            break;
        case '4':
            await performAction('pass');
            break;
        case '5':
            await performAction('clear');
            break;
        case '6':
            user.getDID()
                .then((did) => printDID(did))
                .then((key) => {
                    console.log(`\n\nYour DID: ${key}\n`);
                    displayMenu();
                });
            break;
        case '7':
            console.log('Exiting...');
            rl.close();
            return;
        default:
            console.log('Invalid option. Please try again.');
            displayMenu();
    }
}

async function main() {
    console.log('Welcome to the NBH Client!');
    console.log('Creating a new user...');
    user = await createUser();
    console.log(
        `User ${await printDID(await user.getDID())} created successfully.`,
    );
    displayMenu();
}

main();

rl.on('close', () => {
    process.exit(0);
});
