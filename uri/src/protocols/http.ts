import { Authorization, ContentType, KVPairs, WWWAuthenticate } from '@divine/headers';
import path from 'path';
import request from 'request';
import { PassThrough, Readable } from 'stream';
import { AuthScheme, AuthSchemeRequest } from '../auth-schemes';
import { Parser } from '../parsers';
import { DirectoryEntry, HEADERS, Metadata, STATUS, STATUS_TEXT, URI, URIException, VOID } from '../uri';

export class HTTPProtocol extends URI {
    async info<T extends DirectoryEntry>(): Promise<T & Metadata> {
        const response = await this._query<T>('HEAD', {}, null, undefined, undefined);
        const headers  = response[HEADERS]!;
        const location = new URI(headers['content-location'] ?? '', this);
        const length   = headers['content-length'];
        const type     = headers['content-type'];
        const modified = headers['last-modified'];

        return this.requireValidStatus<DirectoryEntry>({
            ...extractMetadata(response),
            uri:     this.toString(),
            name:    path.posix.basename(location.pathname),
            type:    type || 'application/octet-stream',
            length:  typeof length === 'string' ? Number(length) : undefined,
            updated: typeof modified === 'string' ? new Date(modified) : undefined,
        }) as T & Metadata;
    }

    async load<T extends object>(recvCT?: ContentType | string): Promise<T> {
        return this.requireValidStatus(await this._query('GET', {}, null, undefined, recvCT));
    }

    async save<T extends object>(data: unknown, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T> {
        return this.requireValidStatus(await this._query('PUT', {}, data, sendCT, recvCT));
    }

    async append<T extends object>(data: unknown, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T> {
        return this.requireValidStatus(await this._query('POST', {}, data, sendCT, recvCT));
    }

    async modify<T extends object>(data: unknown, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T> {
        return this.requireValidStatus(await this._query('PATCH', {}, data, sendCT, recvCT));
    }

    async remove<T extends object>(recvCT?: ContentType | string): Promise<T> {
        return this.requireValidStatus(await this._query('DELETE', {}, null, undefined, recvCT));
    }

    async query<T extends object>(method: string, headers?: KVPairs | null, data?: unknown, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T> {
        if (typeof method !== 'string') {
            throw new URIException(`URI ${this}: query: 'method' argument missing/invalid`);
        }
        else if (headers !== undefined && !(headers instanceof Object)) {
            throw new URIException(`URI ${this}: query: 'headers' argument missing/invalid`);
        }
        else if (sendCT !== undefined && !(sendCT instanceof ContentType) && typeof sendCT !== 'string') {
            throw new URIException(`URI ${this}: query: 'sendCT' argument invalid`);
        }
        else if (recvCT !== undefined && !(recvCT instanceof ContentType) && typeof recvCT !== 'string') {
            throw new URIException(`URI ${this}: query: 'recvCT' argument invalid`);
        }

        return this.requireValidStatus(await this._query(method, headers || {}, data, sendCT, recvCT));
    }

    protected requireValidStatus<T extends object & Metadata>(result: T): T {
        const status = result[STATUS];

        if (status && (status < 200 || status >= 300)) {
            throw new URIException(`URI ${this} request failed: ${result[STATUS_TEXT]} [${status}]`, undefined, result);
        }
        else {
            return result;
        }
    }

    private async _getAuthorization(req: AuthSchemeRequest, payload?: Buffer | AsyncIterable<Buffer>, challenges?: WWWAuthenticate[]): Promise<Authorization | undefined> {
        let session = this.getBestSelector(this.selectors?.session);

        if (!session?.authScheme) {
            const { auth, challenge } = (challenges?.length ? challenges : [undefined as WWWAuthenticate | undefined])
                .map((challenge) => ({ auth: this.getBestSelector(this.selectors?.auth, challenge), challenge }))
                .filter((entry) => !!entry.auth)
                [0];

            if (auth && (challenge || auth.preemptive)) {
                this.selectors = this.selectors ?? {};
                this.selectors.session = this.selectors.session ?? [];

                if (!session) {
                    this.selectors.session.push(session = { selector: {} });
                }

                if (auth.credentials instanceof AuthScheme) {
                    session.authScheme = auth.credentials;
                }
                else if (challenge) {
                    session.authScheme = AuthScheme.create(challenge).setCredentialsProvider(auth.credentials);
                }
                else if (auth.selector.authScheme) {
                    session.authScheme = AuthScheme.create(auth.selector.authScheme).setCredentialsProvider(auth.credentials);
                }
            }
        }

        const challenge = challenges?.find((challenge) => challenge.scheme === session?.authScheme?.scheme);
        return session?.authScheme?.createAuthorization(challenge, req, payload instanceof Buffer ? payload : undefined);
    }

    private async _query<T>(method: string, headers: KVPairs, data: unknown, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T & Metadata> {
        const bodyLess = data === null || data === undefined;
        const [contentType, serialized] = await Parser.serialize(sendCT, data);
        headers = bodyLess ? headers : { 'content-type': contentType.toString(), ...headers };

        if (!headers.authorization) {
            headers.authorization = (await this._getAuthorization({ method, url: this, headers }, serialized))?.toString();
        }

        return new Promise(async (resolve, reject) => {
            const iterable = request({
                method,
                uri:      this.toString(),
                headers,
                body:     bodyLess ? null : Readable.from(serialized),
                encoding: null,
                gzip:     true,
            })
            .on('response', async (response) => {
                try {
                    const result: T & Metadata = method === 'HEAD' || response.statusCode === 204 /* No Content */ ? Object(VOID) :
                        await Parser.parse(ContentType.create(recvCT, response.headers['content-type']), iterable);

                    result[HEADERS]     = convertHeaders(response);
                    result[STATUS]      = response.statusCode;
                    result[STATUS_TEXT] = response.statusMessage;

                    resolve(result);
                }
                catch (err) {
                    reject(this.makeException(err));
                }
            })
            .on('error', (err) => reject(this.makeException(err)))
            .pipe(new PassThrough());
        });
    }
}

function extractMetadata(m: Metadata) {
    return { [STATUS]: m[STATUS], [STATUS_TEXT]: m[STATUS_TEXT], [HEADERS]: m[HEADERS] };
}

function convertHeaders(response: request.Response): KVPairs {
    const result: KVPairs = {};

    for (const [name, value] of Object.entries({ ...response.headers, ...response.trailers })) {
        result[name] = Array.isArray(value) ? value.join(',') : value;
    }

    return result;
}
