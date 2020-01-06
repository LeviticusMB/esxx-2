import { ContentType } from '@divine/headers';
import * as path from 'path';
import { OAuthOptions } from 'request';
import * as uri from 'uri-js';
import * as url from 'url';
import * as utils from './utils';

const URI_OPTIONS: uri.URIOptions = {
    domainHost:     true,
    iri:            true,
    unicodeSupport: true,
};

export interface Headers {
    [key: string]: string | undefined;
}

export interface PropertyFilter {
    realm?:      string | RegExp | null;
    authScheme?: string | RegExp | null;
    scheme?:     string | RegExp;
    path?:       string | RegExp | null;
    port?:       number | RegExp | null;
    host?:       string | RegExp | null;
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

export class URI {
    static readonly void          = Symbol('Represents a void result');
    static readonly null          = Symbol('Represents a null result');
    static readonly headers       = Symbol('Used to access the response headers');
    static readonly trailers      = Symbol('Used to access the response trailers');
    static readonly statusCode    = Symbol('Used to access the response status code');
    static readonly statusMessage = Symbol('Used to access the response status message');

    static register(scheme: string, uri: typeof URI): typeof URI {
        URI.protocols.set(scheme, uri);
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

    private uri!: uri.URIComponents;

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
                // this.auth = [ { name: ui[1] && decodeURIComponent(ui[1]),
                //                 auth: ui[2] && decodeURIComponent(ui[3]) } ];
            }

            // Always strip credentials from URI for security reasons
            delete this.uri.userinfo;
        }

        this.uri = uri.normalize(this.uri);

        return new (this.uri.scheme && URI.protocols.get(this.uri.scheme) || UnknownURI)(this);
    }

    resolvePath(filepath: string): this {
        return new URI(this, URI.encodePath(filepath)) as this;
    }

    toASCIIString(): string {
        return uri.serialize({ ...this.uri }, {
            unicodeSupport: true,
            domainHost:     true,
        });
    }

    valueOf(): string {
        return uri.serialize({ ...this.uri }, URI_OPTIONS);
    }

    get uriScheme(): string {
        return this.uri.scheme as string;
    }

    get uriHost(): string | null {
        return this.uri.host !== undefined ? this.uri.host : null;
    }

    get uriPort(): string | null {
        return this.uri.port !== undefined ? this.uri.port.toString() : null;
    }

    get uriPath(): string | null {
        return this.uri.path !== undefined ? this.uri.path : null;
    }

    get uriQuery(): string | null {
        return this.uri.query !== undefined ? this.uri.query : null;
    }

    get uriFragment(): string | null {
        return this.uri.fragment !== undefined ? this.uri.fragment : null;
    }

    setParams(params: Param[]): this {
        this.params = params;
        return this;
    }

    setAuth(auth: Auth[]): this {
        this.auth = auth;
        return this;
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

    protected getBestProperty<T extends PropertyFilter>(props?: T[], authScheme?: string | null, realm?: string | null): T | null {
        let result: T | null = null;
        let score = -1;

        for (const { prop: p, score: s } of this.enumerateProperties(props, authScheme, realm)) {
            if (s > score) {
                result = p;
                score  = s;
            }
        }

        return result;
    }

    protected filterProperties<T extends PropertyFilter>(props?: T[], authScheme?: string | null, realm?: string | null): T[] {
        const result: T[] = [];

        for (const { prop } of this.enumerateProperties(props, authScheme, realm)) {
            result.push(prop);
        }

        return result;
    }

    private *enumerateProperties<T extends PropertyFilter>(props?: T[] | null, authScheme?: string | null, realm?: string | null): IterableIterator<{ prop: T, score: number }> {
        if (!props) {
            return;
        }

        const propertyScore = (prop: PropertyFilter, key: keyof PropertyFilter, value: string | number | undefined | null): number => {
            const expected = prop[key];

            if (expected === undefined || value === undefined) {
                return 0;
            }
            else if (expected instanceof RegExp) {
                return value !== null && expected.test(value.toString()) ? 1 : -Infinity;
            }
            else {
                return expected === value ? 1 : -Infinity;
            }
        };

        for (const prop of props) {
            let score = 0;

            score += propertyScore(prop, 'realm',      realm)          * 1;
            score += propertyScore(prop, 'authScheme', authScheme)     * 2;
            score += propertyScore(prop, 'scheme',     this.uriScheme) * 4;
            score += propertyScore(prop, 'path',       this.uriPath)   * 8;
            score += propertyScore(prop, 'port',       this.uriPort)   * 16;
            score += propertyScore(prop, 'host',       this.uriHost)   * 32;
            score += propertyScore(prop, 'uri',        this.valueOf()) * 64;

            if (score >= 0) {
                yield { prop, score };
            }
        }
    }
}

class UnknownURI extends URI {}
