
import { PassThrough } from 'stream';
import { Parser }      from './parsers';
import * as request    from 'request';
import * as uri        from 'uri-js';
import * as url        from 'url';
import * as utils      from './utils';

const URI_OPTIONS: uri.URIOptions = {
    iri:            true,
    unicodeSupport: true,
    domainHost:     true,
};

export type  ContentType = utils.ContentType;
export let   ContentType = utils.ContentType;
export type URIException = utils.URIException;
export let  URIException = utils.URIException;

export interface Headers {
    [key: string] : string | string[];
};

export class URI {
    private static protocols = new Map<string, typeof URI>();

    private uri: uri.URIComponents;

    params: any;
    auth: any;
    jars: any;
    headers: any;

    constructor(base: string | URI | url.Url, relative?: string | URI | url.Url , params?: utils.Params) {
        if (arguments.length === 1 && this.constructor !== URI && base.constructor === URI) {
            Object.assign(this, base);
            return;
        }

        let Url = (url as any).Url;

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

        let relative_uri: uri.URIComponents | undefined;

        if (typeof relative === 'string') {
            if (params !== undefined) {
                relative = utils.esxxEncoder(relative, params, encodeURIComponent);
            }

            relative_uri = uri.parse(relative, URI_OPTIONS);
        }
        else if (relative instanceof URI) {
            relative_uri = relative.uri;
        }
        else if (relative instanceof Url) {
            relative_uri = uri.parse(url.format(relative as url.Url), URI_OPTIONS);
        }
        else if (relative !== undefined) {
            throw new URIException('Relative argument must be type string, URI or Url, if provided');
        }

        if (this.uri.reference === 'same-document' || this.uri.reference == 'relative') {
            // base is relative -- resolve it against current working directory first
            this.uri = uri.resolveComponents(uri.parse(`file:///${process.cwd()}/`, { tolerant: true }), this.uri, URI_OPTIONS, true);
        }

        if (relative_uri !== undefined) {
            if (this.uri.host !== undefined) {
                this.uri = uri.resolveComponents(this.uri, relative_uri, URI_OPTIONS, true);
            }
            else if (relative_uri.reference === 'same-document') {
                this.uri.fragment = relative_uri.fragment;
            }
            else {
                throw new URIException('Relative argument must be fragment only, if base URI is not a URL');
            }
        }

        if (this.uri.userinfo) {
            let ui = /([^:]*)(:(.*))?/.exec(this.uri.userinfo);

            if (ui) {
                this.auth = [ { username: ui[1] && decodeURIComponent(ui[1]),
                                password: ui[2] && decodeURIComponent(ui[3]) } ];
            }

            delete this.uri.userinfo;
        }
        
        this.uri = uri.normalize(this.uri);

        return new (this.uri.scheme && URI.protocols.get(this.uri.scheme) || UNKNOWN_URI)(this);
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

    async load(_recv_ct?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support load()`);
    }

    async save(_data: any, _send_ct?: ContentType | string, _recv_ct?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support save()`);
    }

    async append(_data: any, _send_ct?: ContentType | string, _recv_ct?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support append()`);
    }

    async modify(_data: any, _send_ct?: ContentType | string, _recv_ct?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support modify()`);
    }

    async remove(_recv_ct?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support remove()`);
    }

    async query(..._args: any[]): Promise<any> {
        throw new URIException(`URI ${this} does not support query()`);
    }


    static register(scheme: string, uri: typeof URI) : typeof URI {
        URI.protocols.set(scheme, uri);
        return URI;
    }


    static $(strings: TemplateStringsArray, ...values: any[]): URI {
        return new URI(URI.encodeURIComponent(strings, ...values))
    }

    static encodeURI(strings: TemplateStringsArray, ...values: any[]): string {
        return utils.es6Encoder(strings, values, encodeURI);
    }

    static encodeURIComponent(strings: TemplateStringsArray, ...values: any[]): string {
        return utils.es6Encoder(strings, values, encodeURIComponent);
    }
}

class UNKNOWN_URI extends URI {}

class HTTP_URL extends URI {
    async load(recv_ct?: ContentType | string): Promise<any> {
        return this.requireValidStatus(await this._query('GET', {}, null, undefined, recv_ct));
    }

    async save(data: any, send_ct?: ContentType | string, recv_ct?: ContentType): Promise<any> {
        return this.requireValidStatus(await this._query('PUT', {}, data, send_ct, recv_ct));
    }

    async append(data: any, send_ct?: ContentType | string, recv_ct?: ContentType | string): Promise<any> {
        return this.requireValidStatus(await this._query('POST', {}, data, send_ct, recv_ct));
    }

    async modify(data: any, send_ct?: ContentType | string, recv_ct?: ContentType | string): Promise<any> {
        return this.requireValidStatus(await this._query('PATCH', {}, data, send_ct, recv_ct));
    }

    async remove(recv_ct?: ContentType | string): Promise<any> {
        return this.requireValidStatus(await this._query('DELETE', {}, null, undefined, recv_ct));
    }

    protected requireValidStatus(result: any): any {
        if (result['@statusCode'] < 200 || result['@statusCode'] >= 300) {
            throw new URIException(`URI ${this} request failed: ${result['@statusMessage']} [${result['@statusCode']}]`, undefined, result);
        }
        else {
            return result;
        }
    }

    private _query(method: string, headers: Headers, data: any, send_ct?: ContentType | string, recv_ct?: ContentType | string): Promise<any> {
        return new Promise(async (resolve, reject) => {
            let [contentType, serialized] = await Parser.serialize(send_ct, data);

            let observable = utils.toObservable(
                request({
                    method:   method,
                    uri:      this.valueOf(),
                    headers:  Object.assign({ 'content-type': contentType }, headers),
                    body:     utils.toReadableStream(serialized),
                    encoding: null,
                    gzip:     true,
                })
                .on('response', async (response) => {
                    try {
                        let result = await Parser.parse(ContentType.create(recv_ct, response.headers['content-type']), observable);

                        // FIXME: Symbols!
                        Object.defineProperty(result, '@headers',       { value: response.headers       });
                        Object.defineProperty(result, '@trailers',      { value: response.trailers      });
                        Object.defineProperty(result, '@statusCode',    { value: response.statusCode    });
                        Object.defineProperty(result, '@statusMessage', { value: response.statusMessage });

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
    .register("http",  HTTP_URL)
    .register("https", HTTP_URL)
;
