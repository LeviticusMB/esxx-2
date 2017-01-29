
import { PassThrough } from 'stream';
import { Parser }      from './parsers';

import * as request    from 'request';
import * as uri        from 'uri-js';
import * as url        from 'url';
import * as utils      from './utils';

const URI_OPTIONS: uri.URIOptions = {
    domainHost:     true,
    iri:            true,
    unicodeSupport: true,
};

export type  ContentType  = utils.ContentType;
export const ContentType  = utils.ContentType;
export type  URIException = utils.URIException;
export const URIException = utils.URIException;

export interface Headers {
    [key: string]: string | undefined;
}

export interface DirectoryEntry {
    name: string;
    length?: number;
    lastModified?: Date;
    type: string;
}

export class URI {
    static readonly headers       = Symbol('Used to access the response headers');
    static readonly trailers      = Symbol('Used to access the response trailers');
    static readonly statusCode    = Symbol('Used to access the response status code');
    static readonly statusMessage = Symbol('Used to access the response status message');

    static register(scheme: string, uri: typeof URI): typeof URI {
        URI.protocols.set(scheme, uri);
        return URI;
    }


    static $(strings: TemplateStringsArray, ...values: any[]): URI {
        return new URI(URI.encodeURIComponent(strings, ...values));
    }

    static encodeURI(strings: TemplateStringsArray, ...values: any[]): string {
        return utils.es6Encoder(strings, values, encodeURI);
    }

    static encodeURIComponent(strings: TemplateStringsArray, ...values: any[]): string {
        return utils.es6Encoder(strings, values, encodeURIComponent);
    }


    private static protocols = new Map<string, typeof URI>();

    params: any;
    auth: any;
    jars: any;
    headers: any;

    private uri: uri.URIComponents;

    constructor(base: string | URI | url.Url, relative?: string | URI | url.Url , params?: utils.Params) {
        if (arguments.length === 1 && this.constructor !== URI && base.constructor === URI) {
            Object.assign(this, base);
            return;
        }

        const Url = (url as any).Url;

        // relative argument is optional ...
        if (params === undefined && typeof relative !== 'string' && !(relative instanceof URI) && !(relative instanceof Url)) {
            params   = relative as any;
            relative = undefined;
        }

        // ... and so is params
        if (params !== undefined) {
            params = utils.kvWrapper(params);
        }

        if (typeof base === 'string') {
            if (params !== undefined) {
                base = utils.esxxEncoder(base, params, encodeURIComponent);
            }

            this.uri = uri.parse(base, URI_OPTIONS);
        }
        else if (base instanceof URI) {
            this.uri     = base.uri;
            this.params  = base.params;
            this.auth    = base.auth;
            this.jars    = base.jars;
            this.headers = base.headers;
        }
        else if (base instanceof Url) {
            this.uri = uri.parse(url.format(base), URI_OPTIONS);
        }
        else {
            throw new URIException('First argument must be of type string, URI or Url');
        }

        let relativeURI: uri.URIComponents | undefined;

        if (typeof relative === 'string') {
            if (params !== undefined) {
                relative = utils.esxxEncoder(relative, params, encodeURIComponent);
            }

            relativeURI = uri.parse(relative, URI_OPTIONS);
        }
        else if (relative instanceof URI) {
            relativeURI = relative.uri;
        }
        else if (relative instanceof Url) {
            relativeURI = uri.parse(url.format(relative as url.Url), URI_OPTIONS);
        }
        else if (relative !== undefined) {
            throw new URIException('Relative argument must be type string, URI or Url, if provided');
        }

        if (this.uri.reference === 'same-document' || this.uri.reference === 'relative') {
            // base is relative -- resolve it against current working directory first
            this.uri = uri.resolveComponents(uri.parse(`file://${process.cwd()}/`, { tolerant: true }), this.uri, URI_OPTIONS, true);
        }

        if (relativeURI !== undefined) {
            if (this.uri.host !== undefined) {
                this.uri = uri.resolveComponents(this.uri, relativeURI, URI_OPTIONS, true);
            }
            else if (relativeURI.reference === 'same-document') {
                this.uri.fragment = relativeURI.fragment;
            }
            else {
                throw new URIException('Relative argument must be fragment only, if base URI is not a URL');
            }
        }

        if (this.uri.userinfo) {
            const ui = /([^:]*)(:(.*))?/.exec(this.uri.userinfo);

            if (ui) {
                this.auth = [ { username: ui[1] && decodeURIComponent(ui[1]),
                                password: ui[2] && decodeURIComponent(ui[3]) } ];
            }

            // Always strip credentials from URI for security reasons
            delete this.uri.userinfo;
        }

        this.uri = uri.normalize(this.uri);

        return new (this.uri.scheme && URI.protocols.get(this.uri.scheme) || UnknownURI)(this);
    }

    valueOf(): string {
        return uri.serialize(Object.assign({}, this.uri), {
            unicodeSupport: true,
            domainHost:     true,
        });
    }

    toString(): string {
        return uri.serialize(Object.assign({}, this.uri), URI_OPTIONS);
    }

    get uriScheme(): string {
        return this.uri.scheme as string;
    }

    get uriHost(): string | undefined {
        return this.uri.host;
    }

    get uriPort(): string | undefined {
        return this.uri.port !== undefined ? this.uri.port.toString() : undefined;
    }

    get uriPath(): string | undefined {
        return this.uri.path;
    }

    get uriQuery(): string | undefined {
        return this.uri.query;
    }

    get uriFragment(): string | undefined {
        return this.uri.fragment;
    }

    async info(): Promise<DirectoryEntry> {
        throw new URIException(`URI ${this} does not support info()`);
    }

    async list(): Promise<DirectoryEntry[]> {
        throw new URIException(`URI ${this} does not support list()`);
    }

    async load(_recvCT?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support load()`);
    }

    async save(_data: any, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support save()`);
    }

    async append(_data: any, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support append()`);
    }

    async modify(_data: any, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support modify()`);
    }

    async remove(_recvCT?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support remove()`);
    }

    async query(..._args: any[]): Promise<any> {
        throw new URIException(`URI ${this} does not support query()`);
    }
}

class UnknownURI extends URI {}

class HTTP extends URI {
    async info(): Promise<DirectoryEntry> {
        const response: Object = await this._query('HEAD', {}, null, undefined, undefined);
        const headers: Headers = (response as any)[URI.headers];
        const location = new URI(this, headers['content-location']);
        const length   = headers['content-length'];
        const type     = headers['content-type'];
        const modified = headers['last-modified'];

        return this.requireValidStatus(Object.assign(response, {
            name:         (location.uriPath || '').replace(/.*\//, ''),
            length:       typeof length === 'string' ? Number(length) : undefined,
            lastModified: typeof modified === 'string' ? new Date(modified) : undefined,
            type:         type || 'application/octet-stream',
        }));
    }

    async load(recvCT?: ContentType | string): Promise<any> {
        return this.requireValidStatus(await this._query('GET', {}, null, undefined, recvCT));
    }

    async save(data: any, sendCT?: ContentType | string, recvCT?: ContentType): Promise<any> {
        return this.requireValidStatus(await this._query('PUT', {}, data, sendCT, recvCT));
    }

    async append(data: any, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<any> {
        return this.requireValidStatus(await this._query('POST', {}, data, sendCT, recvCT));
    }

    async modify(data: any, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<any> {
        return this.requireValidStatus(await this._query('PATCH', {}, data, sendCT, recvCT));
    }

    async remove(recvCT?: ContentType | string): Promise<any> {
        return this.requireValidStatus(await this._query('DELETE', {}, null, undefined, recvCT));
    }

    async query(method: string, headers?: Headers | null, data?: any,
                sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<any> {
        if (typeof method !== 'string') {
            throw new URIException("URI ${this}: query: 'method' argument missing/invalid");
        }
        else if (headers !== undefined && !(headers instanceof Object)) {
            throw new URIException("URI ${this}: query: 'headers' argument missing/invalid");
        }
        else if (sendCT !== undefined && !(sendCT instanceof ContentType) && typeof sendCT !== 'string') {
            throw new URIException("URI ${this}: query: 'sendCT' argument invalid");
        }
        else if (recvCT !== undefined && !(recvCT instanceof ContentType) && typeof recvCT !== 'string') {
            throw new URIException("URI ${this}: query: 'recvCT' argument invalid");
        }

        return this.requireValidStatus(await this._query(method, headers || {}, data, sendCT, recvCT));
    }

    protected requireValidStatus<T>(result: T): T {
        const [code, message] = [(result as any)[URI.statusCode], (result as any)[URI.statusMessage]];

        if (code < 200 || code >= 300) {
            throw new URIException(`URI ${this} request failed: ${message} [${code}]`, undefined, result);
        }
        else {
            return result;
        }
    }

    private _query(method: string, headers: Headers, data: any,
                   sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<any> {
        return new Promise(async (resolve, reject) => {
            const bodyLess = data === null || data === undefined;
            const [contentType, serialized] = await Parser.serialize(sendCT, data);

            const observable = utils.toObservable('utf8' /* Not applicable because of 'encoding: null' below */,
                request({
                    method:   method,
                    uri:      this.valueOf(),
                    headers:  bodyLess ? headers : Object.assign({ 'content-type': contentType }, headers),
                    body:     bodyLess ? null    : utils.toReadableStream(serialized),
                    encoding: null,
                    gzip:     true,
                })
                .on('response', async (response) => {
                    try {
                        const result = method === 'HEAD' || response.statusCode === 204 /* No Content */ ? Object.create(null) :
                            await Parser.parse(ContentType.create(recvCT, response.headers['content-type']), observable);

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

// Register all built-in protocols

URI
    .register("http",  HTTP)
    .register("https", HTTP)
;
