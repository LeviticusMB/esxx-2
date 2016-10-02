
const url   = require('url');
const utils = require('./utils');

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

            this.uri = base;
            this.url = url.parse(base);
        }
        else if (base instanceof URI) {
            this.uri = base.uri;
            this.url = base.url;

            // Copy extra props from cloned URI too
            for (let prop of ['params', 'auth', 'jars', 'headers']) {
                if (base.hasOwnProperty(prop)) {
                    this.prop = base[prop];
                }
            }
        }
        else if (base instanceof url.Url) {
            this.uri = url.format(base);
            this.url = base;
        }
        else {
            throw new URIError('First argument must be of type string, URI or Url');
        }

        if (typeof relative === 'string') {
            if (params !== undefined) {
                relative = utils.esxxEncoder(relative, params, encodeURIComponent);
            }

            relative = url.parse(relative);
        }
        else if (relative instanceof URI) {
            relative = relative.url;
        }
        else if (relative !== undefined && !(relative instanceof url.Url)) {
            throw new URIError('Relative argument must be type string, URI or Url, if provided');
        }

        if (!this.url.protocol) {
            // base is relative -- resolve it against current working directory first
            this.url = url.parse(url.resolve(`file://${process.cwd()}/`, this.url));
        }

        if (relative !== undefined) {
            if (this.url.slashes) {
                this.url = url.parse(url.resolve(this.url, relative), true);
                this.uri = url.format(this.url);
            }
            else if (relative.href[0] === '#') {
                this.uri = this.uri.replace(/#.*/, '') + relative.href;
                this.url = url.parse(this.uri, true);
            }
            else {
                throw new URIError('Relative argument must be fragment only, if base URI is not a URL');
            }
        }

        if (typeof this.url.query === 'string') {
            this.url = url.parse(url.format(this.url), true);
        }

        // Remove redundant parts of URL
        ['host', 'search', 'path', 'href'].forEach((prop) => delete this.url[prop]);
    }

    valueOf() {
        return this.uri;
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

u=new URI('http://user:password@host.name:99/path/to/?q1=2&q2&q3=nej#fragment&and&parts')
console.log(u);

u=new URI('jdbc:h2:mem:?reconnect=true');
console.log(u);

u=new URI('mailto:martin@blom.org?subject=hej hopp', 'foo');
console.log(u);
