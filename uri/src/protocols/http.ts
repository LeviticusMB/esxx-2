import { ContentType } from '@divine/headers';
import path from 'path';
import request from 'request';
import { PassThrough } from 'stream';
import { Parser } from '../parsers';
import { DirectoryEntry, Headers, HEADERS, Metadata, STATUS, STATUS_TEXT, URI, URIException, VOID } from '../uri';
import { IteratorStream, toAsyncIterable } from '../utils';

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

    async query<T extends object>(method: string, headers?: Headers | null, data?: unknown, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T> {
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

    private _query<T>(method: string, headers: Headers, data: unknown, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T & Metadata> {
        return new Promise(async (resolve, reject) => {
            const bodyLess = data === null || data === undefined;
            const [contentType, serialized] = await Parser.serialize(sendCT, data);

            // let auth = this.getBestProperty(this.auth, undefined, undefined);

            // if (auth) {
            // }

            const iterable = toAsyncIterable(request({
                    method:   method,
                    uri:      this.toString(),
                    headers:  bodyLess ? headers : { 'content-type': contentType, ...headers },
                    body:     bodyLess ? null    : new IteratorStream(serialized),
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
                .pipe(new PassThrough())
                .on('error', (err) => reject(this.makeException(err)))
            );
        });
    }
}

function extractMetadata(m: Metadata) {
    return { [STATUS]: m[STATUS], [STATUS_TEXT]: m[STATUS_TEXT], [HEADERS]: m[HEADERS] };
}

function convertHeaders(response: request.Response): Headers {
    const result: Headers = {};

    for (const [name, value] of Object.entries({ ...response.headers, ...response.trailers })) {
        result[name] = Array.isArray(value) ? value.join(',') : value;
    }

    return result;
}
