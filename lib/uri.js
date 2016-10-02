
"use strict";

const uri   = require('uri-js');
const url   = require('url');
const utils = require('./utils');

const URI_OPTIONS = {
    iri:            true,
    unicodeSupport: true,
    domainHost:     true,
};

class URI {
    constructor(base, relative, params) {
        // relative argument is optional ...
        if (params === undefined && typeof relative !== 'string' && !(relative instanceof URI) && !(relative instanceof url.Url)) {
            params   = relative;
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
            this.uri = base.uri;

            // Copy extra props from cloned URI too
            for (let prop of ['params', 'auth', 'jars', 'headers']) {
                if (base.hasOwnProperty(prop)) {
                    this.prop = base[prop];
                }
            }
        }
        else if (base instanceof url.Url) {
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
        else if (relative instanceof url.Url) {
            relative = uri.parse(url.format(relative), URI_OPTIONS);
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
            else if (relative.reference === 'same-document') {
                this.uri.fragment = relative.fragment;
            }
            else {
                throw new URIError('Relative argument must be fragment only, if base URI is not a URL');
            }
        }

        this.uri = uri.normalize(this.uri);
    }

    valueOf() {
        return uri.serialize(Object.assign({}, this.uri), {
            unicodeSupport: true,
            domainHost:     true,
        });
    }

    toString() {
        return uri.serialize(Object.assign({}, this.uri), URI_OPTIONS);
    }

    static uri(strings, ...values) {
        return new URI(URI.encodeURIComponent(strings, ...values))
    }

    static encodeURI(strings, ...values) {
        return utils.es6Encoder(strings, values, encodeURI);
    }

    static encodeURIComponent(strings, ...values) {
        return utils.es6Encoder(strings, values, encodeURIComponent);
    }
}

exports = URI;

var u;
u=new URI('/etc/fäle.txt?nåpe')
console.log(""+u, u.toString(), String(u));

u=new URI('http://user:password@höst.name:99/%7Epath/tå/?q1=2&q2&q3=nej#fragment&and&parts')
console.log(""+u, u.toString(), u);

u=new URI('jdbc:h2:mem:?reconnect=true');
console.log(""+u, u.toString(), u);

u=new URI('mailto:märtin@blom.org?subject=hej%20hopp&content-type=text/html&to=foo@bar.com&x-body=nej&body=hejhej', '#no');
console.log(""+u, u.toString(), u);
