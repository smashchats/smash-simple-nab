import { SessionObject } from 'graphene-pk11';
import {
    Crypto,
    CryptoParams,
    KeyStorage,
    SubtleCrypto,
} from 'node-webcrypto-p11';

export const SPLITTER = '-';

class CryptoSubtleWithMutex extends SubtleCrypto {
    private operationMutex = {
        locked: false,
        queue: [] as (() => void)[],

        async acquire() {
            if (this.locked) {
                await new Promise<void>((resolve) => this.queue.push(resolve));
            }
            this.locked = true;
        },

        release() {
            this.locked = false;
            const next = this.queue.shift();
            if (next) {
                this.locked = true;
                next();
            }
        },
    };

    private originalSubtle: SubtleCrypto;

    constructor(subtle: SubtleCrypto) {
        super(subtle.container);
        this.originalSubtle = subtle;
    }

    private async performOperation<T, A extends unknown[]>(
        operation: string,
        args: [...A],
    ): Promise<T> {
        try {
            await this.operationMutex.acquire();
            // @ts-expect-error we are overriding the type with extended class
            const result = await this.originalSubtle[operation](...args);
            return result;
        } finally {
            this.operationMutex.release();
        }
    }

    public async sign(
        ...args: Parameters<SubtleCrypto['sign']>
    ): ReturnType<SubtleCrypto['sign']> {
        return this.performOperation('sign', args);
    }

    public async verify(
        ...args: Parameters<SubtleCrypto['verify']>
    ): ReturnType<SubtleCrypto['verify']> {
        return this.performOperation('verify', args);
    }

    public async digest(
        ...args: Parameters<SubtleCrypto['digest']>
    ): ReturnType<SubtleCrypto['digest']> {
        return this.performOperation('digest', args);
    }

    public async encrypt(
        ...args: Parameters<SubtleCrypto['encrypt']>
    ): ReturnType<SubtleCrypto['encrypt']> {
        return this.performOperation('encrypt', args);
    }

    public async decrypt(
        ...args: Parameters<SubtleCrypto['decrypt']>
    ): ReturnType<SubtleCrypto['decrypt']> {
        return this.performOperation('decrypt', args);
    }

    public async wrapKey(
        ...args: Parameters<SubtleCrypto['wrapKey']>
    ): ReturnType<SubtleCrypto['wrapKey']> {
        return this.performOperation('wrapKey', args);
    }

    public async unwrapKey(
        ...args: Parameters<SubtleCrypto['unwrapKey']>
    ): ReturnType<SubtleCrypto['unwrapKey']> {
        return this.performOperation('unwrapKey', args);
    }

    public async deriveBits(
        ...args: Parameters<SubtleCrypto['deriveBits']>
    ): ReturnType<SubtleCrypto['deriveBits']> {
        return this.performOperation('deriveBits', args);
    }

    public async deriveKey(
        ...args: Parameters<SubtleCrypto['deriveKey']>
    ): ReturnType<SubtleCrypto['deriveKey']> {
        return this.performOperation('deriveKey', args);
    }

    // @ts-expect-error we are overriding the type with extended class
    public async generateKey(
        ...args: Parameters<SubtleCrypto['generateKey']>
    ): ReturnType<SubtleCrypto['generateKey']> {
        return this.performOperation('generateKey', args);
    }

    public async importKey(
        ...args: Parameters<SubtleCrypto['importKey']>
    ): ReturnType<SubtleCrypto['importKey']> {
        return this.performOperation('importKey', args);
    }

    // @ts-expect-error we are overriding the type with extended class
    public async exportKey(
        ...args: Parameters<SubtleCrypto['exportKey']>
    ): ReturnType<SubtleCrypto['exportKey']> {
        return this.performOperation('exportKey', args);
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
        this.subtle = new CryptoSubtleWithMutex(this.subtle);
        this.keyStorage = new KeyStorageModified(this);
    }
}
