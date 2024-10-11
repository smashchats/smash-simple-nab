import { SessionObject } from 'graphene-pk11';
import { Crypto as CryptoP11 } from 'node-webcrypto-p11';

export const SPLITTER = '-';

export const createCryptoP11FromConfig = (config: any) => {
    const c = new CryptoP11(config);
    // @ts-ignore
    c.keyStorage.getItemById = (classAndId: string): SessionObject | null => {
        const [keyClass, id] = classAndId.split(SPLITTER);
        let key = null;
        c.session.find(
            {
                class: parseInt(keyClass),
                token: true,
                id: Buffer.from(id, 'hex'),
            },
            (obj) => {
                key = obj.toType<any>();
                return false;
            },
        );
        return key;
    };
    return c;
};
