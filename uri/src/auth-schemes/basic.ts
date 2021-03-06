import { AuthenticationInfo, Authorization, ServerAuthorization, WWWAuthenticate } from '@divine/headers';
import { AuthScheme, AuthSchemeError, AuthSchemeRequest, Credentials } from '../auth-schemes';
import { b64Decode, b64Encode } from '../private/utils';

export class BasicCredentials extends Credentials {
    constructor(identity: string, public secret: string) {
        super(identity);
    }
}

export class BasicAuthScheme extends AuthScheme<BasicCredentials> {
    constructor(scheme = 'basic') {
        super(scheme);
    }

    encodeCredentials(credentials: BasicCredentials): string {
        return b64Encode(`${credentials.identity}:${credentials.secret}`);
    }

    decodeCredentials(credentials?: string): BasicCredentials | undefined {
        const [, username, password] = /([^:]*):?(.*)/.exec(b64Decode(credentials ?? '')) ?? [undefined, undefined, undefined];

        return username !== undefined && password !== undefined ? new BasicCredentials(username, password) : undefined;
    }

    async createAuthorization(challenge?: WWWAuthenticate, request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<Authorization | undefined> {
        const credentials = await this.getCredentials({ mode: 'retrieve', authScheme: this, challenge, request });
        const proxyHeader = challenge?.isProxyHeader() ?? this.proxy;

        return credentials ? new Authorization(`${this.scheme} ${this.encodeCredentials(credentials)}`, proxyHeader) : undefined;
    }

    async verifyAuthorization<T extends Authorization | undefined>(authorization: T, request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<T> {
        const untrusted = this.decodeCredentials(this.assertCompatibleAuthHeader(authorization)?.credentials);

        if (!untrusted) {
            throw new AuthSchemeError(`No credentials provided`, await this.createChallenge(authorization));
        }

        const trusted = await this.getCredentials({ mode: 'verify', authScheme: this, identity: untrusted.identity, authorization, request});

        if (!trusted) {
            throw new AuthSchemeError(`User ${untrusted.identity} not found`, await this.createChallenge(authorization));
        }

        if (!this.safeCompare(this.encodeCredentials(untrusted), this.encodeCredentials(trusted))) {
            throw new AuthSchemeError(`Invalid password`, await this.createChallenge(authorization));
        }

        return authorization;
    }

    async verifyAuthenticationInfo<T extends AuthenticationInfo | ServerAuthorization | undefined>(authentication: T, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<T> {
        return authentication;
    }

    protected isCompatibleCredentials(credentials: BasicCredentials): boolean {
        return typeof credentials.identity === 'string' && typeof credentials.secret === 'string';
    }
}

AuthScheme.register('basic', BasicAuthScheme);
