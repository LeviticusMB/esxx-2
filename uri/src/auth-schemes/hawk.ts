import { BasicCredentials } from './basic';

export class HawkCredentials extends BasicCredentials {
    constructor(identity: string, secret: string, public algorithm: 'sha1' | 'sha256' = 'sha256') {
        super(identity, secret);
    }
}
