import { SessionObject } from 'graphene-pk11';
import {
    Crypto,
    CryptoKey,
    CryptoParams,
    KeyStorage,
    Pkcs11KeyAlgorithm,
    SubtleCrypto,
} from 'node-webcrypto-p11';

export const SPLITTER = '-';

interface CryptoKeyPairP11 extends CryptoKeyPair {
    privateKey: CryptoKey<Pkcs11KeyAlgorithm>;
    publicKey: CryptoKey<Pkcs11KeyAlgorithm>;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class CryptoSubtleWithQueue extends SubtleCrypto {
    private eventQueue: (() => Promise<void>)[] = [];
    private isProcessingQueue: boolean = false;

    constructor(subtle: SubtleCrypto) {
        super(subtle.container);
    }

    private async processEventQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;
        while (this.eventQueue.length > 0) {
            const event = this.eventQueue.shift()!;
            try {
                await event();
                await delay(5);
            } catch (error) {
                console.error(`Error processing event ${event.name}:`, error);
            }
        }
        this.isProcessingQueue = false;
    }

    private queueOperation<T, A extends unknown[]>(
        operation: (...args: A) => Promise<T>,
        args: [...A],
    ): Promise<T> {
        return new Promise((resolve) => {
            this.eventQueue.push(async () =>
                resolve(await operation.apply(this, args)),
            );
            this.processEventQueue();
        });
    }

    protected computeId(
        publicKey: CryptoKey<Pkcs11KeyAlgorithm>,
    ): Promise<Buffer> {
        return this.queueOperation(super.computeId.bind(this), [publicKey]);
    }

    public importKey(
        ...args: Parameters<SubtleCrypto['importKey']>
    ): ReturnType<SubtleCrypto['importKey']> {
        return this.queueOperation(super.importKey.bind(this), args);
    }

    public async sign(
        ...args: Parameters<SubtleCrypto['sign']>
    ): ReturnType<SubtleCrypto['sign']> {
        return this.queueOperation(super.sign.bind(this), args);
    }

    public async digest(
        ...args: Parameters<SubtleCrypto['digest']>
    ): ReturnType<SubtleCrypto['digest']> {
        return this.queueOperation(super.digest.bind(this), args);
    }

    public async verify(
        ...args: Parameters<SubtleCrypto['verify']>
    ): ReturnType<SubtleCrypto['verify']> {
        return this.queueOperation(super.verify.bind(this), args);
    }

    public async encrypt(
        ...args: Parameters<SubtleCrypto['encrypt']>
    ): ReturnType<SubtleCrypto['encrypt']> {
        return this.queueOperation(super.encrypt.bind(this), args);
    }

    public async decrypt(
        ...args: Parameters<SubtleCrypto['decrypt']>
    ): ReturnType<SubtleCrypto['decrypt']> {
        return this.queueOperation(super.decrypt.bind(this), args);
    }

    public async deriveBits(
        ...args: Parameters<SubtleCrypto['deriveBits']>
    ): ReturnType<SubtleCrypto['deriveBits']> {
        return this.queueOperation(super.deriveBits.bind(this), args);
    }

    public async deriveKey(
        ...args: Parameters<SubtleCrypto['deriveKey']>
    ): ReturnType<SubtleCrypto['deriveKey']> {
        return this.queueOperation(super.deriveKey.bind(this), args);
    }

    public async wrapKey(
        ...args: Parameters<SubtleCrypto['wrapKey']>
    ): ReturnType<SubtleCrypto['wrapKey']> {
        return this.queueOperation(super.wrapKey.bind(this), args);
    }

    public async unwrapKey(
        ...args: Parameters<SubtleCrypto['unwrapKey']>
    ): ReturnType<SubtleCrypto['unwrapKey']> {
        return this.queueOperation(super.unwrapKey.bind(this), args);
    }

    // @ts-expect-error we are overriding the type with extended class
    public async generateKey(
        algorithm:
            | 'Ed25519'
            | RsaHashedKeyGenParams
            | EcKeyGenParams
            | AesKeyGenParams
            | HmacKeyGenParams
            | Pbkdf2Params
            | AlgorithmIdentifier,
        extractable: boolean,
        keyUsages: readonly KeyUsage[],
    ): Promise<CryptoKeyPairP11> {
        return this.queueOperation(super.generateKey.bind(this), [
            algorithm,
            extractable,
            keyUsages,
        ]) as unknown as Promise<CryptoKeyPairP11>;
    }
}

class KeyStorageModified extends KeyStorage {
    public getItemById(classAndId: string): SessionObject | null {
        const [keyClass, id] = classAndId.split(SPLITTER);
        let key = null;
        this.crypto.session.find(
            {
                class: parseInt(keyClass),
                token: true,
                id: Buffer.from(id, 'hex'),
            },
            (obj) => {
                key = obj.toType<SessionObject>();
                return false;
            },
        );
        return key;
    }
}

export class CryptoP11 extends Crypto {
    constructor(config: CryptoParams) {
        super(config);
        // @ts-expect-error we are overriding the type with extended class
        this.subtle = new CryptoSubtleWithQueue(this.subtle);
        this.keyStorage = new KeyStorageModified(this);
    }
}
