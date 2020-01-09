import { IncomingMessage, ServerResponse } from 'http';
import { WebException, WebStatus } from './error';
import { WebRequest, WebResource, WebResourceCtor, WebResponse } from './resource';
import { isReadableStream } from './utils';

export interface WebServiceConfig {
    console:             Console;
    trustForwardedFor:   boolean;
    trustForwardedHost:  boolean;
    trustForwardedProto: boolean;
    trustMethodOverride: boolean;
}

interface ResourceDescriptor<Context> {
    resource: WebResourceCtor<Context>;
    pattern:  string;
    groups:   number;
}

const ALLOWED_METHODS = /^(HEAD|GET|PUT|POST|PATCH|DELETE|OPTIONS)$/;

function getMethods(obj: any): string[] {
    return obj && typeof obj === 'object'
        ? Object.getOwnPropertyNames(obj).filter((method) => typeof obj[method] === 'function').concat(getMethods(Object.getPrototypeOf(obj)))
        : [];
}

export class WebService<Context> {
    public static makeAllowHeader(rsrc: WebResource): string[] {
        const methods: string[] = [];

        for (const method of getMethods(rsrc)) {
            if (ALLOWED_METHODS.test(method)) {
                methods.push(method);
            }
        }

        if (methods.includes('GET') && !methods.includes('HEAD')) {
            methods.push('HEAD');
        }

        if (!methods.includes('OPTIONS')) {
            methods.push('OPTIONS');
        }

        return methods.sort();
    }

    public config: WebServiceConfig;

    private mountPoint = '/';
    private resources: Array<ResourceDescriptor<Context>> = [];
    private resourcePattern?: RegExp;

    constructor(public context: Context, config?: Partial<WebServiceConfig>) {
        this.config = {
            console:             console,
            trustForwardedFor:   false,
            trustForwardedHost:  false,
            trustForwardedProto: false,
            trustMethodOverride: true,
            ...config
        };
    }

    addResource(resource: WebResourceCtor<Context>): this {
        const offset  = this.resources.length ? this.resources.length + this.resources[this.resources.length - 1].groups : 1;
        const source  = resource.path.source;
        const match   = RegExp('|' + source).exec('')!;
        const groups  = match.length - 1;
        const pattern = source.replace(/(^|[^\\])(\\\\)*\(\?<([a-zA-Z0-9]+)>/g, `$1$2(?<_${offset}_$3>`);

        this.resources[offset] = { resource, groups, pattern };
        this.resourcePattern = undefined;

        return this;
    }

    requestEventHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
        return async (req: IncomingMessage, res: ServerResponse) => {
            const webreq = new WebRequest(req, this.config);
            let webres: WebResponse;

            try {
                this.config.console.info(`Incoming ${webreq}`);
                webres = await this.dispatchRequest(webreq);
            }
            catch (err) {
                if (err instanceof WebException) {
                    webres = new WebResponse(err.status, { message: err.message }, err.headers);
                }
                else {
                    this.config.console.error(`${webreq} failed: ${err}`);
                    this.config.console.debug(err);

                    webres = new WebResponse(WebStatus.INTERNAL_SERVER_ERROR, { message: 'Unexpected WebService/WebResource error' });
                }
            }

            if (/^(HEAD|GET)$/.test(webreq.method) && webres.headers.etag && webres.headers.etag === req.headers['if-none-match']) {
                webres = new WebResponse(WebStatus.NOT_MODIFIED, null, webres.headers);
            }

            try {
                webres.writeHead(res);

                if (webreq.method !== 'HEAD') {
                    if (isReadableStream(webres.body)) {
                        this.config.console.info(`Streaming ${webres} for ${webreq}`);
                    }

                    await webres.writeBody(res);
                }

                this.config.console.info(`Sent ${webres} for ${webreq}`);
            }
            catch (err) {
                this.config.console.warn(`Failed to send ${webres} for ${webreq}: ${err}`);
            }
            finally {
                res.end();
            }
        };
    }

    async dispatchRequest(webreq: WebRequest): Promise<WebResponse> {
        // Compile merged pattern
        if (!this.resourcePattern) {
            this.resourcePattern = RegExp(`^${this.mountPoint}(?:${this.resources.filter((r) => !!r).map((r) => `(${r.pattern})`).join('|')})$`);
        }

        // Match incoming request
        const match = this.resourcePattern.exec(webreq.url.pathname);

        if (match) {
            // Find resource that matched
            for (const r in this.resources) {
                if (match[r]) {
                    return this.handleRequest(webreq, this.resources[r], Number(r), match);
                }
            }
        }

        throw new WebException(WebStatus.NOT_FOUND, `No resource matches the path ${webreq.url.pathname}`);
    }

    private async handleRequest(webreq: WebRequest, desc: ResourceDescriptor<Context>, offset: number, match: RegExpExecArray): Promise<WebResponse> {
        const prefix = `_${offset}_`;
        const params: { [param: string]: string } = {};

        for (let i = 1; i <= desc.groups; ++i) {
            params[i] = match[offset + i];
        }

        for (const param in match.groups) {
            if (param.startsWith(prefix)) {
                params[param.substr(prefix.length)] = match.groups[param];
            }
        }

        // tslint:disable-next-line: no-string-literal
        const rsrc = new desc.resource(webreq['setParams'](params), this.context);
        let method = ALLOWED_METHODS.test(webreq.method) ? (rsrc as any)[webreq.method] as typeof rsrc.default : undefined;

        if (!method && webreq.method === 'HEAD') {
            method = rsrc.GET;
        }

        method = method || rsrc.default;

        if (method) {
            const res = await method.call(rsrc, webreq);

            return res instanceof WebResponse ? res : new WebResponse(!!res ? WebStatus.OK : WebStatus.NO_CONTENT, res);
        }
        else if (webreq.method === 'OPTIONS') {
            return new WebResponse(WebStatus.OK, null, {
                allow: WebService.makeAllowHeader(rsrc)
            });
        }
        else {
            throw new WebException(WebStatus.METHOD_NOT_ALLOWED, `This resource does not handle ${webreq.method} requests`, {
                allow: WebService.makeAllowHeader(rsrc)
            });
        }
    }
}
