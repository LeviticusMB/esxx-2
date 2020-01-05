import { PassThrough } from 'stream';
import { Parser } from '../parsers';
import { ContentType, DirectoryEntry, Headers, URI, URIException } from '../uri';
import { IteratorStream, toAsyncIterable } from '../utils';

import path from 'path';
import request from 'request';

export class HTTPProtocol extends URI {
    async info(): Promise<DirectoryEntry> {
        const response: object = await this._query('HEAD', {}, null, undefined, undefined);
        const headers: Headers = (response as any)[URI.headers];
        const location = new URI(this, headers['content-location']);
        const length   = headers['content-length'];
        const type     = headers['content-type'];
        const modified = headers['last-modified'];

        // tslint:disable-next-line:prefer-object-spread
        return this.requireValidStatus(Object.assign(response, {
            uri:     this.valueOf(),
            name:    path.posix.basename(location.uriPath || ''),
            type:    type || 'application/octet-stream',
            length:  typeof length === 'string' ? Number(length) : undefined,
            updated: typeof modified === 'string' ? new Date(modified) : undefined,
        }));
    }

    async load(recvCT?: ContentType | string): Promise<object> {
        return this.requireValidStatus(await this._query('GET', {}, null, undefined, recvCT));
    }

    async save(data: any, sendCT?: ContentType | string, recvCT?: ContentType): Promise<object> {
        return this.requireValidStatus(await this._query('PUT', {}, data, sendCT, recvCT));
    }

    async append(data: any, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<object> {
        return this.requireValidStatus(await this._query('POST', {}, data, sendCT, recvCT));
    }

    async modify(data: any, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<object> {
        return this.requireValidStatus(await this._query('PATCH', {}, data, sendCT, recvCT));
    }

    async remove(recvCT?: ContentType | string): Promise<object> {
        return this.requireValidStatus(await this._query('DELETE', {}, null, undefined, recvCT));
    }

    async query(method: string, headers?: Headers | null, data?: any,
                sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<object> {
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

    protected requireValidStatus<T>(result: T & object): T {
        const [code, message] = [(result as any)[URI.statusCode], (result as any)[URI.statusMessage]];

        if (code < 200 || code >= 300) {
            throw new URIException(`URI ${this} request failed: ${message} [${code}]`, undefined, result);
        }
        else {
            return result;
        }
    }

    private _query(method: string, headers: Headers, data: any,
                   sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<object> {
        return new Promise(async (resolve, reject) => {
            const bodyLess = data === null || data === undefined;
            const [contentType, serialized] = await Parser.serialize(sendCT, data);

            // let auth = this.getBestProperty(this.auth, undefined, undefined);

            // if (auth) {
            // }

            const iterable = toAsyncIterable(request({
                    method:   method,
                    uri:      this.toASCIIString(),
                    headers:  bodyLess ? headers : { 'content-type': contentType, ...headers },
                    body:     bodyLess ? null    : new IteratorStream(serialized),
                    encoding: null,
                    gzip:     true,
                })
                .on('response', async (response) => {
                    try {
                        const result = method === 'HEAD' || response.statusCode === 204 /* No Content */ ? Object(URI.void) :
                            await Parser.parse(ContentType.create(recvCT, response.headers['content-type']), iterable);

                        result[URI.headers]       = response.headers;
                        result[URI.trailers]      = response.trailers;
                        result[URI.statusCode]    = response.statusCode;
                        result[URI.statusMessage] = response.statusMessage;

                        resolve(result);
                    }
                    catch (ex) {
                        reject(ex);
                    }
                })
                .pipe(new PassThrough())
                .on('error', reject)
            );
        });
    }
}
