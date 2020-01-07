import { ContentType } from '@divine/headers';
import path from 'path';
import { OAuthOptions } from 'request';
import url, { Url } from 'url';
import * as utils from './utils';

const urlObject = (url as any).Url;

export interface Headers {
    [key: string]: string | undefined;
}

export interface PropertyFilter {
    realm?:      string | RegExp;
    authScheme?: string | RegExp;
    protocol?:   string | RegExp;
    pathname?:   string | RegExp;
    port?:       string | RegExp | number;
    hostname?:   string | RegExp;
    uri?:        string | RegExp;
}

export interface HawkCredentials {
    id:         string;
    key:        string;
    algorithm?: string;
}

export interface Auth extends PropertyFilter {
    identity?:   string;
    credentials: string | HawkCredentials | OAuthOptions;
    preemptive?: boolean;
}

export interface Param extends PropertyFilter {
    name:  string;
    value: string | number;
}

export interface Header extends PropertyFilter {
    name:  string;
    value: string | number;
}

export interface DirectoryEntry {
    uri:      string;
    name:     string;
    type:     string;
    length?:  number;
    created?: Date;
    updated?: Date;
}

export class URIException extends URIError {
    constructor(message: string, public cause?: Error, public data?: object) {
        super(cause ? `${message}: ${cause.toString()}` : message);
    }
}

function resolveURL(url?: string | URL | Url, base?: string | URL | Url | utils.Params, params?: utils.Params): URL {
    // base argument is optional ...
    if (params === undefined && typeof base !== 'string' && !(base instanceof URL) && !(base instanceof urlObject)) {
        params = base as utils.Params | undefined;
        base   = undefined;
    }

    // ... and so is params
    if (params !== undefined) {
        params = utils.kvWrapper(params);
    }

    if (typeof url === 'string' && params) {
        url = utils.esxxEncoder(url, params, encodeURIComponent);
    }
    else if (url instanceof urlObject) {
        url = (url as Url).href;
    }

    if (typeof base === 'string' && params) {
        base = utils.esxxEncoder(base, params, encodeURIComponent);
    }
    else if (base instanceof urlObject) {
        base = (base as Url).href;
    }

    if (url instanceof URL && base === undefined && params === undefined) {
        return url;
    }
    else {
        return new URL(url?.toString() ?? '', new URL(base?.toString() ?? '', `file://${process.cwd()}/`));
    }
}

function *enumerateProperties<T extends PropertyFilter>(props: T[] | undefined, url: URL, authScheme: string, realm: string): IterableIterator<{ prop: T, score: number }> {
    if (!props) {
        return;
    }

    const propertyScore = (prop: PropertyFilter, key: keyof PropertyFilter, value: string): number => {
        const expected = prop[key];

        if (expected === undefined) {
            return 0;
        }
        else if (expected instanceof RegExp) {
            return expected.test(value.toString()) ? 1 : -Infinity;
        }
        else {
            return String(expected) === value ? 1 : -Infinity;
        }
    };

    for (const prop of props) {
        let score = 0;

        score += propertyScore(prop, 'realm',      realm)           * 1;
        score += propertyScore(prop, 'authScheme', authScheme)      * 2;
        score += propertyScore(prop, 'protocol',   url.protocol)   * 4;
        score += propertyScore(prop, 'pathname',   url.pathname)   * 8;
        score += propertyScore(prop, 'port',       url.port)       * 16;
        score += propertyScore(prop, 'hostname',   url.hostname)   * 32;
        score += propertyScore(prop, 'uri',        url.toString()) * 64;

        if (score >= 0) {
            yield { prop, score };
        }
    }
}

export class URI extends URL {
    static readonly void          = Symbol('URI.void');
    static readonly null          = Symbol('URI.null');
    static readonly headers       = Symbol('URI.headers');
    static readonly trailers      = Symbol('URI.trailers');
    static readonly statusCode    = Symbol('URI.statusCode');
    static readonly statusMessage = Symbol('URI.statusMessage');

    static register(protocol: string, uri: typeof URI): typeof URI {
        URI.protocols.set(protocol, uri);
        return URI;
    }

    static encodePath(filepath: string, type?: 'posix' | 'windows'): string {
        type = type || process.platform === 'win32' ? 'windows' : 'posix';

        if (type === 'windows') {
            filepath = path.win32.normalize(filepath);

            let prefix = '';

            if (/^[A-Za-z]:/.test(filepath)) {
                prefix = '///' + filepath.substr(0, 2).toUpperCase();
                filepath = filepath.substr(2);
            }

            return prefix + filepath.split(/\\/).map((part) => encodeURIComponent(part)).join('/');
        }
        else if (type === 'posix') {
            filepath = path.posix.normalize(filepath);

            return filepath.split('/').map((part) => encodeURIComponent(part)).join('/');
        }
        else {
            throw new TypeError(`Invalid type: ${type}`);
        }
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

    params: Param[] = [];
    auth: Auth[] = [];
    jars: any = [];
    headers: Header[] = [];

    readonly href!: string;
    readonly origin!: string;
    readonly protocol!: string;

    constructor(url?: string | URL | Url, params?: utils.Params);
    constructor(url?: string | URL | Url, base?: string | URL | Url, params?: utils.Params);
    constructor(url?: string | URL | Url, base?: string | URL | Url | utils.Params, params?: utils.Params) {
        super(resolveURL(url, base, params).href);

        if (arguments.length === 1 && this.constructor !== URI && url instanceof URI && url.constructor === URI) {
            this.params  = url.params;
            this.auth    = url.auth;
            this.jars    = url.jars;
            this.headers = url.headers;
            return;
        }

        if (base instanceof URI) {
            this.params  = base.params;
            this.auth    = base.auth;
            this.jars    = base.jars;
            this.headers = base.headers;
        }

        if (this.username || this.password) {
            // this.auth = ...;

            // Always strip credentials from URI for security reasons
            this.username = this.password = '';
        }

        return new (this.protocol && URI.protocols.get(this.protocol) || UnknownURI)(this);
    }

    resolvePath(filepath: string): this {
        return new URI(URI.encodePath(filepath), this) as this;
    }

    toString(): string {
        return this.href;
    }

    async info(): Promise<DirectoryEntry> {
        throw new URIException(`URI ${this} does not support info()`);
    }

    async list(): Promise<DirectoryEntry[]> {
        throw new URIException(`URI ${this} does not support list()`);
    }

    async load(_recvCT?: ContentType | string): Promise<object> {
        throw new URIException(`URI ${this} does not support load()`);
    }

    async save(_data: any, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<object> {
        throw new URIException(`URI ${this} does not support save()`);
    }

    async append(_data: any, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<object> {
        throw new URIException(`URI ${this} does not support append()`);
    }

    async modify(_data: any, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<object> {
        throw new URIException(`URI ${this} does not support modify()`);
    }

    async remove(_recvCT?: ContentType | string): Promise<object> {
        throw new URIException(`URI ${this} does not support remove()`);
    }

    async query(..._args: any[]): Promise<object> {
        throw new URIException(`URI ${this} does not support query()`);
    }

    protected getBestProperty<T extends PropertyFilter>(props: T[] | undefined, authScheme: string, realm: string): T | null {
        let result: T | null = null;
        let bestScore = -1;

        for (const e of enumerateProperties(props, this, authScheme, realm)) {
            if (e.score > bestScore) {
                result = e.prop;
                bestScore = e.score;
            }
        }

        return result;
    }

    protected filterProperties<T extends PropertyFilter>(props: T[], authScheme: string, realm: string): T[] {
        return [...enumerateProperties(props, this, authScheme, realm)].map((e) => e.prop);
    }
}

class UnknownURI extends URI {}
