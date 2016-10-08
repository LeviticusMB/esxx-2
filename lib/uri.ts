
import * as uri   from 'uri-js';
import * as url   from 'url';
import * as utils from './utils';

const URI_OPTIONS = {
    iri:            true,
    unicodeSupport: true,
    domainHost:     true,
};

export class URI {
    uri: any;
    params: any;
    auth: any;
    jars: any;
    headers: any;    

    constructor(base: string | URI | url.Url, relative?: string | URI | url.Url , params?: utils.Params) {
        let Url = (<any> url).Url;

        // relative argument is optional ...
        if (params === undefined && typeof relative !== 'string' && !(relative instanceof URI) && !(relative instanceof Url)) {
            params   = <any> relative;
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
            throw new URIError('First argument must be of type string, URI or Url');
        }

        if (typeof relative === 'string') {
            if (params !== undefined) {
                relative = utils.esxxEncoder(relative, params, encodeURIComponent);
            }

            relative = uri.parse(relative, URI_OPTIONS);
        }
        else if (relative instanceof URI) {
            relative = relative.uri;
        }
        else if (relative instanceof Url) {
            relative = uri.parse(url.format(<url.Url> relative), URI_OPTIONS);
        }
        else if (relative !== undefined) {
            throw new URIError('Relative argument must be type string, URI or Url, if provided');
        }

        if (this.uri.reference === 'same-document' || this.uri.reference == 'relative') {
            // base is relative -- resolve it against current working directory first
            this.uri = uri.resolveComponents(uri.parse(`file:///${process.cwd()}/`, { tolerant: true }), this.uri, URI_OPTIONS, true);
        }

        if (relative !== undefined) {
            if (this.uri.host !== undefined) {
                this.uri = uri.resolveComponents(this.uri, relative, URI_OPTIONS, true);
            }
            else if ((<any> relative).reference === 'same-document') {
                this.uri.fragment = (<any> relative).fragment;
            }
            else {
                throw new URIError('Relative argument must be fragment only, if base URI is not a URL');
            }
        }

        this.uri = uri.normalize(this.uri);
    }

    valueOf() : string {
        return uri.serialize(Object.assign({}, this.uri), {
            unicodeSupport: true,
            domainHost:     true,
        });
    }

    toString() : string {
        return uri.serialize(Object.assign({}, this.uri), URI_OPTIONS);
    }

    static $(strings: TemplateStringsArray, ...values: any[]) : URI {
        return new URI(URI.encodeURIComponent(strings, ...values))
    }

    static encodeURI(strings: TemplateStringsArray, ...values: any[]) : string {
        return utils.es6Encoder(strings, values, encodeURI);
    }

    static encodeURIComponent(strings: TemplateStringsArray, ...values: any[]) : string {
        return utils.es6Encoder(strings, values, encodeURIComponent);
    }
}
