import { SessionObject } from 'graphene-pk11';
import { Crypto } from 'node-webcrypto-p11';

export const SPLITTER = '-';

export const overrideCryptoObject = (c: Crypto) => {
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
    // @ts-ignore
    c.subtle.checkRequiredArguments = (...args: any) => {};
    return c;
};
