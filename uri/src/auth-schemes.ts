import { AuthenticationInfo, AuthHeader, Authorization, KVPairs, ServerAuthorization, WWWAuthenticate } from '@divine/headers';
import { URL } from 'url';
import { Constructor } from './utils';

export abstract class Credentials {
    constructor(public identity: string) {
    }
}

export interface AuthSchemeRequest {
    method: string;
    url: URL;
    headers: KVPairs;
}

export class AuthSchemeException extends Error {
    constructor(message: string, public challenge: WWWAuthenticate) {
        super(message);
    }
}

export interface CredentialsProviderOptions<C extends Credentials> {
    mode:           'retrieve' | 'verify';
    authScheme:     AuthScheme<C>;
    identity?:      string;
    authorization?: Authorization;
    challenge?:     WWWAuthenticate;
    request?:       AuthSchemeRequest;
}

export type CredentialsProvider<C extends Credentials> = (options: CredentialsProviderOptions<C>) => Promise<C | undefined>;

export abstract class AuthScheme<C extends Credentials> {
    static register<C extends Credentials>(scheme: string, authScheme: Constructor<AuthScheme<C>>): typeof AuthScheme {
        AuthScheme._authSchemes.set(scheme, authScheme as unknown as typeof UnknownAuthScheme);
        return AuthScheme;
    }

    static create(from: AuthHeader | string | RegExp, proxy?: boolean): AuthScheme<Credentials> {
        if (from instanceof AuthHeader) {
            return new (AuthScheme._authSchemes.get(from.scheme) ?? UnknownAuthScheme)().setProxyMode(proxy ?? from.isProxyHeader());
        }
        else {
            for (const [scheme, ctor] of this._authSchemes.entries()) {
                if (from instanceof RegExp && from.test(scheme) || from === scheme) {
                    return new ctor().setProxyMode(proxy ?? false);
                }
            }

            return new UnknownAuthScheme();
        }
    }

    private static _authSchemes = new Map<string, typeof UnknownAuthScheme>();

    public realm?: string;
    public proxy: boolean;
    private _credentialsProvider?: CredentialsProvider<C>;

    protected constructor(public scheme: string) {
        this.proxy = false;
    }

    setProxyMode(proxy: boolean): this {
        this.proxy = proxy;
        return this;
    }

    setRealm(realm: string): this {
        this.realm = realm;
        return this;
    }

    setCredentialsProvider(cp?: CredentialsProvider<C> | C): this {
        this._credentialsProvider = typeof cp === 'function' ? cp : () => Promise.resolve(cp);
        return this;
    }

    abstract createAuthorization(challenge?: WWWAuthenticate, request?: AuthSchemeRequest, payload?: Uint8Array): Promise<Authorization | undefined>;
    abstract verifyAuthorization(authorization?: Authorization, request?: AuthSchemeRequest, payload?: Uint8Array): Promise<AuthenticationInfo | undefined>;
    abstract processAuthenticationInfo(_authentication?: AuthenticationInfo | ServerAuthorization, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<void>;
    protected abstract isCompatibleCredentials(credentials: Credentials): boolean;

    protected async createChallenge(authorization?: Authorization): Promise<WWWAuthenticate> {
        const proxyHeader = authorization?.isProxyHeader() ?? this.proxy;

        return new WWWAuthenticate(this.scheme, proxyHeader).setParam('realm', this.realm);
    }

    protected async getCredentials(options: CredentialsProviderOptions<C>): Promise<C | undefined> {
        this.assertCompatibleAuthHeader(options.authorization);
        this.assertCompatibleAuthHeader(options.challenge);

        return this.assertCompatibleCredentials(await this._credentialsProvider?.(options));
    }

    protected safeCompare(untrusted: string | number[], trusted: string | number[]) {
        let sum = 0;

        if (typeof untrusted === 'string' && typeof trusted === 'string') {
            for (let i = 0; i < untrusted.length; ++i) {
                // tslint:disable-next-line: no-bitwise
                sum += untrusted.charCodeAt(i) ^ trusted.charCodeAt(i);
            }
        }
        else if (Array.isArray(untrusted) && Array.isArray(trusted)) {
            for (let i = 0; i < untrusted.length; ++i) {
                // tslint:disable-next-line: no-bitwise
                sum += untrusted[i] ^ trusted[i];
            }
        }
        else {
            throw TypeError(`safeCompare arguments should be string or number[]`);
        }

        return sum === 0 && untrusted.length === trusted.length;
    }

    protected assertCompatibleAuthHeader<H extends AuthHeader>(header?: H): H | undefined {
        if (header !== undefined && header.scheme !== this.scheme) {
            throw new TypeError(`Expected auth-scheme '${this.scheme}' in header, not '${header.scheme}'`);
        }
        else {
            return header;
        }
    }

    protected assertCompatibleCredentials<C extends Credentials>(credentials?: C): C | undefined {
        if (credentials && !this.isCompatibleCredentials(credentials)) {
            throw new TypeError(`Credentials ${credentials.constructor.name}(${Object.keys(credentials)}) is not compatible with ${this.constructor.name}`);
        }
        else {
            return credentials;
        }
    }
}

export class UnknownAuthScheme extends AuthScheme<Credentials> {
    constructor(scheme = 'unknown') {
        super(scheme);
    }

    async createAuthorization(_challenge?: WWWAuthenticate, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<Authorization | undefined> {
        return undefined;
    }

    async verifyAuthorization(_authorization?: Authorization, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<AuthenticationInfo | undefined> {
        throw new AuthSchemeException(`Not supported`, new WWWAuthenticate(this.scheme));
    }

    async processAuthenticationInfo(_authentication?: AuthenticationInfo | ServerAuthorization, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<void> {
        return;
    }

    isCompatibleCredentials(_credentials: Credentials): boolean {
        return false;
    }
}
