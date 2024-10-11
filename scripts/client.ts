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

async function createUser(): Promise<SmashUser> {
    SmashMessaging.setCrypto(crypto);
    const identity = await SmashMessaging.generateIdentity();
    const user = new SmashUser(identity);
    user.on('nbh_profiles', (_, profiles) => {
        console.log('Discovered profiles:');
        profiles.forEach((profile: { ik: string }, index: number) => {
            console.log(`${index + 1}. DID: ${profile.ik}`);
        });
        displayMenu();
    });
    user.on('message', (message) => {
        console.log('Received message:', message);
    });
    return user;
}

async function joinNeighborhood(): Promise<void> {
    rl.question('Enter NAB JOIN info (JSON string): ', async (joinInfoStr) => {
        try {
            const joinInfo: SmashActionJson = JSON.parse(joinInfoStr);
            await user.join(joinInfo);
            nabDid = joinInfo.did;
            console.log('Successfully joined the neighborhood.');
            displayMenu();
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
    // await user.sendMessage(nabDid, { type: 'discover' });
}

async function performAction(
    action: 'smash' | 'pass' | 'clear',
): Promise<void> {
    if (!nabDid) {
        console.log('Please join a neighborhood first.');
        displayMenu();
        return;
    }

    rl.question('Enter the DID (ik) of the target user: ', async (targetIk) => {
        const targetDid: SmashDID = {
            ik: targetIk,
            ek: '',
            signature: '',
            endpoints: [],
        };
        await user[action](targetDid);
        console.log(
            `${action.charAt(0).toUpperCase() + action.slice(1)} action performed successfully.`,
        );
        displayMenu();
    });
}

function displayMenu(): void {
    console.log('\n--- NBH Client Menu ---');
    console.log('1. Join Neighborhood');
    console.log('2. Discover Profiles');
    console.log('3. Smash');
    console.log('4. Pass');
    console.log('5. Clear');
    console.log('6. Exit');
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
    console.log('User created successfully.');
    displayMenu();
}

main();

rl.on('close', () => {
    process.exit(0);
});
