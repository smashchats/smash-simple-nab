#!/usr/bin/env node
import readline from 'readline';
import type {
    DID,
    DIDDocument,
    DIDString,
    SmashActionJson,
    SmashProfileList,
} from 'smash-node-lib';
import {
    DIDDocManager,
    NBH_PROFILE_LIST,
    SmashMessaging,
    SmashUser,
} from 'smash-node-lib';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

let user: SmashUser;
let nabDIDdocument: DIDDocument;

SmashMessaging.setCrypto(crypto);
const didDocManager = new DIDDocManager();
SmashMessaging.use(didDocManager);

const DICT: Record<string, DIDDocument> = {};

const printDID = (did: DID) => {
    const isStrDID = typeof did === 'string';
    const key = isStrDID ? did : did.id;
    if (!isStrDID) DICT[key] = did as DIDDocument;
    return key;
};

const getDID = (key: string): DID =>
    (DICT[key] as DIDDocument) || (key as DIDString);

const addDiscoverListener = (user: SmashUser, callback?: () => void) => {
    user.once(
        NBH_PROFILE_LIST,
        async (sender: DIDString, profiles: SmashProfileList) => {
            console.log(
                '\n\n',
                `Discovered profiles (${printDID(sender)}):`,
                ...(await Promise.all(
                    profiles
                        .toSorted(
                            (a, b) =>
                                (b.scores?.score ?? 0) - (a.scores?.score ?? 0),
                        )
                        .map(
                            async (profile, index) =>
                                `\n${index + 1}. (${Math.round(profile.scores!.score * 100)}) ${printDID(profile.did)} (${profile?.meta?.title})`,
                        ),
                )),
                '\n',
            );
            callback?.();
        },
    );
};

async function createUser(): Promise<SmashUser> {
    const identity = await didDocManager.generate();
    const user = new SmashUser(identity, 'client', 'DEBUG');
    user.on('data', (message) => {
        console.info('\n\nReceived data:', JSON.stringify(message, null, 2));
    });
    return user;
}

async function joinNeighborhood(): Promise<void> {
    rl.question('Enter NAB JOIN info (JSON string): ', async (joinInfoStr) => {
        try {
            const joinInfo: SmashActionJson = JSON.parse(joinInfoStr);
            nabDIDdocument = joinInfo.did as DIDDocument;
            didDocManager.set(nabDIDdocument);
            addDiscoverListener(user, displayMenu);
            await user.join(joinInfo);
            didDocManager.set(await user.getDIDDocument());
            console.log(
                `Successfully queued request to join NBH ${printDID(nabDIDdocument)}`,
            );
        } catch (error) {
            console.error('Error joining neighborhood:', error);
        } finally {
            displayMenu();
        }
    });
}

async function discoverProfiles(): Promise<void> {
    if (!nabDIDdocument) {
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
    if (!nabDIDdocument) {
        console.log('Please join a neighborhood first.');
        displayMenu();
        return;
    }

    rl.question(
        `Enter the DID (id) of the target user to ${action}: `,
        async (targetDID) => {
            await user[action](getDID(targetDID) as DID);
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
    console.log('7. Update profile');
    console.log('8. Exit');
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
            console.log(`\n\nYour DID: ${user.did}\n`);
            displayMenu();
            break;
        case '7':
            rl.question(`Set title: `, async (title) => {
                await user.updateMeta({
                    title,
                    description: '',
                    avatar: '',
                });
                setTimeout(displayMenu, 1000);
            });
            break;
        case '8':
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
        `User ${printDID(await user.getDIDDocument())} created successfully.`,
    );
    displayMenu();
}

main();

rl.on('close', () => {
    process.exit(0);
});
