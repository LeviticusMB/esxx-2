import { ContentType, KVPairs } from '@divine/headers';
import { WebException, WebStatus } from './error';
import { WebRequest } from './request';
import { WebResponse, WebResponses } from './response';

export type WebErrorHandler<Context> = (err: Error, context: Context) => WebResponse | Promise<WebResponse>;

export interface WebFilterCtor<Context> {
    path: RegExp;

    new(args: WebArguments, context: Context): WebFilter;
}

export interface WebFilter {
    filter(next: () => Promise<WebResponse>, args: WebArguments, resource: () => Promise<WebResource>): Promise<WebResponses>;
}

export interface WebResourceCtor<Context> {
    path: RegExp;

    new(args: WebArguments, context: Context): WebResource;
}

export interface WebResource {
    init    ?(args: WebArguments): Promise<void>;
    close   ?(): Promise<void>;

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
        const urlargs = Object.entries(params);
        const headers = Object.entries(request.incomingMessage.headers);
        const qparams = [...request.url.searchParams.entries()];

        this.params = Object.fromEntries([
            ...urlargs.map(([k, v]) => ['$' + k, v]),
            ...headers.map(([k, v]) => ['@' + k, Array.isArray(v) ? v.join(', ') : v]),
            ...qparams.map(([k, v]) => ['?' + k, v])
        ]);
    }

    async body<T extends object>(contentType?: ContentType | string, maxContentLength?: number): Promise<T> {
        const body = await this.request.body<T>(contentType, maxContentLength);

        if (!Array.isArray(body)) {
            for (const [k, v] of Object.entries(body)) {
                if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                    this.params['.' + k] = String(v);
                }
                else if (typeof v === 'object') {
                    this.params['.' + k] = v;
                }
            }
        }

        return body;
    }

    has(param: string): boolean {
        return this._param(param, null!) !== null;
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
        const value = this._param(param, def)?.toString();

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

    optional(param: string): string | undefined {
        return this._param(param, null!)?.toString();
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
            param[0] === '?' ? `Query parameter '${param.substr(1)}'`  :
            param[0] === '@' ? `Request header '${param.substr(1)}`    :
            param[0] === '$' ? `URL parameter '${param.substr(1)}'`    :
            param[0] === '.' ? `Entity parameter '${param.substr(1)}'` :
            `Invalid parameter '${param}`;

        if (param[0] !== '.') {
            return new WebException(WebStatus.BAD_REQUEST, `${subject} ${is}`);
        }
        else {
            return new WebException(WebStatus.UNPROCESSABLE_ENTITY, `Request entity parameter ${param} ${is}`);
        }
    }
}
