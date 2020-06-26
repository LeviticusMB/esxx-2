import { AuthenticationInfo, Authorization, ServerAuthorization, WWWAuthenticate } from '@divine/headers';
import { AuthScheme, AuthSchemeError, AuthSchemeRequest, Credentials } from '../auth-schemes';

export class BearerCredentials extends Credentials {
    constructor(token: string) {
        super(token);
    }
}

export class BearerAuthScheme extends AuthScheme<BearerCredentials> {
    constructor(scheme = 'bearer') {
        super(scheme);
    }

    async createAuthorization(challenge?: WWWAuthenticate | undefined, request?: AuthSchemeRequest | undefined, payload?: Uint8Array | undefined): Promise<Authorization | undefined> {
        const credentials = await this.getCredentials({ mode: 'retrieve', authScheme: this, challenge, request });
        const proxyHeader = challenge?.isProxyHeader() ?? this.proxy;

        return credentials ? new Authorization(`${this.scheme} ${credentials.identity}`, proxyHeader) : undefined;
    }

    async verifyAuthorization<T extends Authorization | undefined>(authorization: T, request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<T> {
        const identity = this.assertCompatibleAuthHeader(authorization)?.credentials;

        if (!identity) {
            throw new AuthSchemeError(`No credentials provided`, await this.createChallenge(authorization));
        }

        const trusted = await this.getCredentials({ mode: 'verify', authScheme: this, identity, authorization, request});

        if (!trusted || !this.safeCompare(identity, trusted.identity)) {
            throw new AuthSchemeError(`Token not valid`, (await this.createChallenge(authorization)).setParam('error', 'invalid_token'));
        }

        return authorization;
    }

    async verifyAuthenticationInfo<T extends AuthenticationInfo | ServerAuthorization | undefined>(authentication: T, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<T> {
        return authentication;
    }

    protected isCompatibleCredentials(credentials: BearerCredentials): boolean {
        return typeof credentials.identity === 'string';
    }
}

AuthScheme.register('bearer', BearerAuthScheme);
