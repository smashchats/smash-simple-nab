import { SessionObject } from 'graphene-pk11';
import {
    Crypto,
    CryptoParams,
    KeyStorage,
    SubtleCrypto,
} from 'node-webcrypto-p11';

export const SPLITTER = '-';

class CryptoSubtleWithQueue extends SubtleCrypto {
    // Add mutex lock
    private signMutex = {
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

    constructor(subtle: SubtleCrypto) {
        super(subtle.container);
    }

    private async performOperation<T, A extends unknown[]>(
        operation: (...args: A) => Promise<T>,
        args: [...A],
    ): Promise<T> {
        try {
            await this.signMutex.acquire();
            return await operation.apply(this, args);
        } finally {
            this.signMutex.release();
        }
    }

    public async sign(
        ...args: Parameters<SubtleCrypto['sign']>
    ): ReturnType<SubtleCrypto['sign']> {
        return this.performOperation(super.sign.bind(this), args);
    }

    public async verify(
        ...args: Parameters<SubtleCrypto['verify']>
    ): ReturnType<SubtleCrypto['verify']> {
        return this.performOperation(super.verify.bind(this), args);
    }

    public async digest(
        ...args: Parameters<SubtleCrypto['digest']>
    ): ReturnType<SubtleCrypto['digest']> {
        return this.performOperation(super.digest.bind(this), args);
    }

    public async encrypt(
        ...args: Parameters<SubtleCrypto['encrypt']>
    ): ReturnType<SubtleCrypto['encrypt']> {
        return this.performOperation(super.encrypt.bind(this), args);
    }

    public async decrypt(
        ...args: Parameters<SubtleCrypto['decrypt']>
    ): ReturnType<SubtleCrypto['decrypt']> {
        return this.performOperation(super.decrypt.bind(this), args);
    }

    public async wrapKey(
        ...args: Parameters<SubtleCrypto['wrapKey']>
    ): ReturnType<SubtleCrypto['wrapKey']> {
        return this.performOperation(super.wrapKey.bind(this), args);
    }

    public async unwrapKey(
        ...args: Parameters<SubtleCrypto['unwrapKey']>
    ): ReturnType<SubtleCrypto['unwrapKey']> {
        return this.performOperation(super.unwrapKey.bind(this), args);
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
        this.subtle = new CryptoSubtleWithQueue(this.subtle);
        this.keyStorage = new KeyStorageModified(this);
    }
}
