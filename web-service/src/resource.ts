import { ContentType, KVPairs, ContentDisposition, WWWAuthenticate } from '@divine/headers';
import { AuthSchemeRequest, Finalizable, FINALIZE, Parser } from '@divine/uri';
import { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http';
import { pipeline, Readable } from 'stream';
import { TLSSocket } from 'tls';
import { UAParser } from 'ua-parser-js';
import { URL } from 'url';
import { WebException, WebStatus } from './error';
import { WebServiceConfig } from './service';
import { isReadableStream, SizeLimitedReadableStream } from './utils';

export type WebErrorHandler<Context> = (err: Error, context: Context) => WebResponse | Promise<WebResponse>;

export interface WebFilterCtor<Context> {
    path: RegExp;

    new(args: WebArguments, resource: WebResource | undefined, context: Context): WebFilter;
}

export interface WebFilter {
    filter(next: () => Promise<WebResponse>, args: WebArguments, resource: WebResource | undefined): Promise<WebResponses>;
}

export interface WebResourceCtor<Context> {
    path: RegExp;

    new(args: WebArguments, context: Context): WebResource;
}

export interface WebResource {
    HEAD    ?(args: WebArguments): Promise<WebResponses>;
    GET     ?(args: WebArguments): Promise<WebResponses>;
    PUT     ?(args: WebArguments): Promise<WebResponses>;
    POST    ?(args: WebArguments): Promise<WebResponses>;
    PATCH   ?(args: WebArguments): Promise<WebResponses>;
    DELETE  ?(args: WebArguments): Promise<WebResponses>;
    OPTIONS ?(args: WebArguments): Promise<WebResponses>;
    default ?(args: WebArguments): Promise<WebResponses>;
    catch   ?(err: Error): WebResponse | Promise<WebResponse>;
}

export class WebArguments {
    public readonly params: { [key: string]: string | object | undefined };

    constructor(params: KVPairs, public readonly request: WebRequest) {
        const headers = Object.entries(request.incomingMessage.headers);
        const qparams = [...request.url.searchParams.entries()];

        this.params = {
            ...params,
            ...Object.fromEntries(headers.map(([k, v]) => [`@${k}`, Array.isArray(v) ? v.join(', ') : v])),
            ...Object.fromEntries(qparams.map(([k, v]) => [`?${k}`, v]))
        };
    }

    async body<T extends object>(maxContentLength?: number): Promise<T> {
        const body = await this.request.body<T>(maxContentLength);

        if (!Array.isArray(body)) {
            for (const [k, v] of Object.entries(body)) {
                if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                    this.params[k] = String(v);
                }
                else if (typeof v === 'object') {
                    this.params[k] = v;
                }
            }
        }

        return body;
    }

    boolean(param: string, def?: boolean): boolean {
        const value = this.string(param, def?.toString());

        if (value === 'true' || value === '1' || value === 't') {
            return true;
        }
        else if (value === 'false' || value === '0' || value === 'f') {
            return false;
        }
        else {
            throw this._makeException(param, 'is not a valid boolean');
        }
    }

    date(param: string, def?: Date): Date {
        const value = new Date(this.string(param, def?.toISOString()));

        if (isNaN(value.getTime())) {
            throw this._makeException(param, 'is not a valid date');
        }

        return value;
    }

    number(param: string, def?: number): number {
        const value = Number(this.string(param, def?.toString()));

        if (isNaN(value)) {
            throw this._makeException(param, 'is not a valid number');
        }

        return value;
    }

    string(param: string, def?: string): string {
        const value = this._param(param, def);

        if (typeof value !== 'string') {
            throw this._makeException(param, 'is not a string');
        }

        return value;
    }

    object<T extends object>(param: string, def?: T): T {
        const value = this._param(param, def);

        if (typeof value !== 'object') {
            throw this._makeException(param, 'is not an object');
        }

        return value as T;
    }

    private _param(param: string, def?: string | object): string | object {
        const value = this.params[param];

        if (value === undefined) {
            if (def === undefined) {
                throw this._makeException(param, 'is missing');
            }

            return def;
        }
        else {
            return value;
        }
    }

    private _makeException(param: string, is: string): WebException {
        const subject =
            param[0] === '?' ? `Query parameter '${param.substr(1)}'` :
            param[0] === '@' ? `Request header '${param.substr(1)}`   :
            param[0] === '$' ? `URL parameter '${param.substr(1)}'`   :
            undefined;

        if (subject) {
            return new WebException(WebStatus.BAD_REQUEST, `${subject} ${is}`);
        }
        else {
            return new WebException(WebStatus.UNPROCESSABLE_ENTITY, `Request entity parameter ${param} ${is}`);
        }
    }
}

export interface UserAgent {
    ua?:     string;
    browser: { name?: string, version?: string, major?: string };
    engine:  { name?: string, version?: string };
    os:      { name?: string, version?: string };
    device:  { vendor?: string, model?: string, type?: 'console' | 'mobile' | 'tablet' | 'smarttv' | 'wearable' | 'embedded' };
    cpu:     { architecture?: '68k' | 'amd64' | 'arm' | 'arm64' | 'avr' | 'ia32' | 'ia64' | 'irix' | 'irix64' | 'mips' | 'mips64' | 'pa-risc' | 'ppc' | 'sparc' | 'spark64' };
}

export class WebRequest implements AuthSchemeRequest {
    public readonly method: string;
    public readonly url: URL;
    public readonly remoteAddress: string;
    public readonly userAgent: UserAgent;

    private _finalizers: Array<() => Promise<void>> = [];

    constructor(public incomingMessage: IncomingMessage, config: WebServiceConfig) {
        const incomingScheme = incomingMessage.socket instanceof TLSSocket ? 'https' : 'http';
        const incomingServer = incomingMessage.headers.host ?? `${incomingMessage.socket.localAddress}:${incomingMessage.socket.localPort}`;
        const incomingRemote = incomingMessage.socket.remoteAddress;
        const incomingMethod = incomingMessage.method;

        const scheme       = String((config.trustForwardedProto ? this.header('x-forwarded-proto',      '', false) : '') || incomingScheme);
        const server       = String((config.trustForwardedHost  ? this.header('x-forwarded-host',       '', false) : '') || incomingServer);
        this.remoteAddress = String((config.trustForwardedFor   ? this.header('x-forwarded-for',        '', false) : '') || incomingRemote);
        this.method        = String((config.trustMethodOverride ? this.header('x-http-method-override', '', false) : '') || incomingMethod);
        this.url           = new URL(`${scheme}://${server}${incomingMessage.url}`);
        this.userAgent     = new UAParser(incomingMessage.headers['user-agent']).getResult() as any;

        if (!this.userAgent.browser.name && this.userAgent.ua) {
            const match = /^(?<name>[^/]+)(?:\/(?<version>(?<major>[^.]+)[^/ ]*))?/.exec(this.userAgent.ua);

            if (match) {
                this.userAgent.browser = { ...match.groups };
            }
        }
    }

    get remoteUserAgent(): string {
        return this.userAgent.browser.name && this.userAgent.browser.version ? `${this.userAgent.browser.name}/${this.userAgent.browser.version}@${this.remoteAddress}` : `Unknown@${this.remoteAddress}`;
    }

    get headers(): Iterable<[string, string]> {
        return Object.entries(this.incomingMessage.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value!]);
    }

    header(name: keyof IncomingHttpHeaders, def?: string | string[], concatenate = true): string {
        let value = this.incomingMessage.headers[String(name).toLowerCase()];

        if (value === undefined || value instanceof Array && value[0] === undefined) {
            if (def === undefined) {
                throw new WebException(WebStatus.BAD_REQUEST, `Missing request header '${name}'`);
            }

            value = def;
        }

        if (Array.isArray(value)) {
            return concatenate ? value.join(', ') : value[0];
        }
        else {
            return value;
        }
    }

    async body<T extends object>(maxContentLength = 1_000_000): Promise<T> {
        const tooLarge = `Maximum payload size is ${maxContentLength} bytes`;

        if (Number(this.header('content-length', '-1')) > maxContentLength) {
            throw new WebException(WebStatus.PAYLOAD_TOO_LARGE, tooLarge);
        }

        const limited = new SizeLimitedReadableStream(maxContentLength, () => new WebException(WebStatus.PAYLOAD_TOO_LARGE, tooLarge));

        return this.addFinalizer(await Parser.parse<T>(ContentType.create(this.header('content-type')), this.incomingMessage.pipe(limited)));
    }

    addFinalizer<T extends object>(finalizable: T & Finalizable): T {
        const finalize = finalizable[FINALIZE];

        if (finalize) {
            this._finalizers.push(finalize);
        }

        return finalizable;
    }

    close() {
        // Run all finalizers, but do propagate first error
        return Promise.all(this._finalizers.map((finalize) => finalize()));
    }

    toString(): string {
        const ct = this.incomingMessage.headers['content-type']?.replace(/;.*/, '');

        return `[WebRequest: ${this.method} ${this.url.href} ${ct ?? '-'}]`;
    }
}

export class WebResponse {
    public body: Buffer | NodeJS.ReadableStream | null;

    constructor(public status: WebStatus, body?: null | NodeJS.ReadableStream | Buffer | string | number | bigint | boolean | Date | object, public headers: WebResponseHeaders = {}) {
        const defaultCT = (ct: ContentType) => this.headers['content-type'] = this.headers['content-type'] ?? ct;

        if (body === undefined || body === null) {
            this.body = null;
        }
        else if (body instanceof Buffer || isReadableStream(body)) {
            defaultCT(ContentType.bytes);
            this.body = body;
        }
        else if (typeof body === 'string' || typeof body === 'number' || typeof body === 'bigint' || typeof body === 'boolean' || body instanceof Date) {
            defaultCT(ContentType.text);
            this.body = Buffer.from(body instanceof Date ? body.toISOString() : body.toString());
        }
        else {
            try {
                const [ct, serializied ] = Parser.serialize(this.headers['content-type'], body);

                defaultCT(ct);
                this.body = serializied instanceof Buffer ? serializied : Readable.from(serializied);
            }
            catch (err) {
                throw new WebException(WebStatus.INTERNAL_SERVER_ERROR, err.message);
            }
        }

        if (this.body instanceof Buffer) {
            this.headers['content-length'] = this.body.length;
        }
    }

    setHeader(name: string, value: string | number | boolean | string[] | undefined): this {
        (this.headers as any)[name.toLowerCase()] = value;

        return this;
    }

    async close() {
        if (this.body instanceof Readable) {
            this.body.destroy();
        }
    }

    writeHead(to: ServerResponse) {
        to.writeHead(this.status, Object.fromEntries(Object.entries(this.headers).filter(([_key, value]) => value !== undefined)));
    }

    writeBody(to: NodeJS.WritableStream): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.body instanceof Buffer) {
                to.write(this.body, (err) => err ? reject(err) : resolve());
            }
            else if (this.body) {
                pipeline(this.body, to, (err) => err ? reject(err) : resolve());
            }
            else {
                resolve();
            }
        });
    }

    toString(): string {
        const ct = this.headers['content-type']?.toString().replace(/;.*/, '');

        return `[WebResponse: ${this.status} ${WebStatus[this.status] || this.status} ${ct ?? '-'}]`;
    }
}

export interface WebResponseHeaders {
    'allow'?: string[];
    'content-length'?: number;
    'content-type'?: string | ContentType;
    'etag'?: string;
}

export type WebResponses = null | WebResponse | NodeJS.ReadableStream | Buffer | string | number | bigint | boolean | Date | object;
