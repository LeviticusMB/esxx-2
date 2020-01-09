import { ContentType } from '@divine/headers';
import { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http';
import { pipeline } from 'stream';
import { TLSSocket } from 'tls';
import { WebException, WebResponseHeaders, WebStatus } from './error';
import { WebServiceConfig } from './service';
import { isReadableStream } from './utils';

export interface WebFilter<Context> {
    path: RegExp;

    filter(req: WebRequest, context: Context, resource: WebResource, next: () => WebResponse): Promise<WebResponses | undefined>;
}

export interface WebResourceCtor<Context> {
    path: RegExp;

    new(req: WebRequest, context: Context): WebResource;
}

export interface WebResource {
    HEAD    ?(req: WebRequest): Promise<WebResponses>;
    GET     ?(req: WebRequest): Promise<WebResponses>;
    PUT     ?(req: WebRequest): Promise<WebResponses>;
    POST    ?(req: WebRequest): Promise<WebResponses>;
    PATCH   ?(req: WebRequest): Promise<WebResponses>;
    DELETE  ?(req: WebRequest): Promise<WebResponses>;
    OPTIONS ?(req: WebRequest): Promise<WebResponses>;
    default ?(req: WebRequest): Promise<WebResponses>;
}

export class WebRequest {
    public readonly method: string;
    public readonly remote: string;
    public readonly url: URL;

    private params!: { [key: string]: string | undefined };

    constructor(public incomingMessage: IncomingMessage, config: WebServiceConfig) {
        const scheme = String((config.trustForwardedProto ? this.header('x-forwarded-proto',      '') : '') || incomingMessage.socket instanceof TLSSocket ? 'https' : 'http');
        const server = String((config.trustForwardedHost  ? this.header('x-forwarded-host',       '') : '') || incomingMessage.headers.host);
        this.remote  = String((config.trustForwardedFor   ? this.header('x-forwarded-for',        '') : '') || incomingMessage.socket.remoteAddress);
        this.method  = String((config.trustMethodOverride ? this.header('x-http-method-override', '') : '') || incomingMessage.method);
        this.url     = new URL(`${scheme}://${server}${incomingMessage.url}`);
    }

    header(name: keyof IncomingHttpHeaders, def?: string | string[], concatenate = false): string {
        let value = this.incomingMessage.headers[name];

        if (value === undefined || value instanceof Array && value[0] === undefined) {
            if (def === undefined) {
                throw new WebException(WebStatus.BAD_REQUEST, `Missing request header '${name}'`);
            }

            value = def;
        }

        if (value instanceof Array) {
            return concatenate ? value.join(', ') : value[0];
        }
        else {
            return value;
        }
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
            throw new WebException(WebStatus.BAD_REQUEST, `URL parameter '${param}' is not a valid boolean`);
        }
    }

    date(param: string, def?: Date): Date {
        const value = new Date(this.string(param, def?.toISOString()));

        if (isNaN(value.getTime())) {
            throw new WebException(WebStatus.BAD_REQUEST, `URL parameter '${param}' is not a valid date`);
        }

        return value;
    }

    number(param: string, def?: number): number {
        const value = Number(this.string(param, def?.toString()));

        if (isNaN(value)) {
            throw new WebException(WebStatus.BAD_REQUEST, `URL parameter '${param}' is not a valid number`);
        }

        return value;
    }

    string(param: string, def?: string): string {
        const value = this.params[param];

        if (value === undefined) {
            if (def === undefined) {
                throw new WebException(WebStatus.BAD_REQUEST, `Missing URL parameter '${param}'`);
            }

            return def;
        }
        else {
            return value;
        }
    }

    async message<T = object>(): Promise<T> {
        throw new Error();
    }

    toString(): string {
        return `[WebRequest: ${this.method} ${this.url.href} ${this.incomingMessage.httpVersion} {${this.remote}}]`;
    }

    protected setParams(params: { [key: string]: string | undefined }): this {
        this.params = { ...params, ...Object.fromEntries(Object.entries(this.url.searchParams).map(([k, v]) => [`?${k}`, v])) };

        return this;
    }
}

export class WebResponse {
    public body: Buffer | NodeJS.ReadableStream | null;

    constructor(public status: WebStatus, body: NodeJS.ReadableStream | Buffer | string | object | null, public headers: WebResponseHeaders = {}) {
        const defaultCT = (ct: ContentType) => this.headers['content-type'] = this.headers['content-type'] ?? ct;

        if (body === undefined || body === null) {
            this.body = null;
        }
        else if (body instanceof Buffer || isReadableStream(body)) {
            defaultCT(ContentType.bytes);
            this.body = body;
        }
        else if (typeof body === 'string') {
            defaultCT(ContentType.text);
            this.body = Buffer.from(body);
        }
        else if (typeof body === 'object' && (Object.getPrototypeOf(body) === Object.prototype || Object.getPrototypeOf(body) === Array.prototype)) {
            defaultCT(ContentType.json);
            this.body = Buffer.from(JSON.stringify(body));
        }
        else {
            throw new WebException(WebStatus.INTERNAL_SERVER_ERROR, `Unsupported response data type: ${typeof body}`);
        }

        if (this.body instanceof Buffer) {
            this.headers['content-length'] = this.body.length;
        }
    }

    customHeader(name: string, value: string | number | boolean | undefined): this {
        (this.headers as any)[name.toLowerCase()] = value;

        return this;
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
        return `[WebResponse: ${this.status} ${WebStatus[this.status] || this.status} ${Object.entries(this.headers).map(([k, v]) => `${k}=${v}`).join(', ')}]`;
    }
}

export type WebResponses = WebResponse | NodeJS.ReadableStream | Buffer | string | object | null;
