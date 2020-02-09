import { KVPairs } from '@divine/headers';
import { IncomingMessage, ServerResponse } from 'http';
import { WebException, WebStatus } from './error';
import { WebArguments, WebErrorHandler, WebFilterCtor, WebRequest, WebResource, WebResourceCtor, WebResponse, WebResponses } from './resource';
import { isReadableStream } from './utils';

export interface WebServiceConfig {
    console?:             Console;
    trustForwardedFor?:   boolean;
    trustForwardedHost?:  boolean;
    trustForwardedProto?: boolean;
    trustMethodOverride?: boolean;
}

interface FilterDescriptor<Context> {
    filter: WebFilterCtor<Context>;
    pattern:  RegExp;
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

function regExpParams(match: RegExpExecArray, offset: number, count: number, prefix: string) {
    const params: KVPairs = {};

    for (let i = 1; i <= count; ++i) {
        params['$' + i] = match[offset + i];
    }

    for (const param in match.groups) {
        if (param.startsWith(prefix)) {
            params['$' + param.substr(prefix.length)] = match.groups[param];
        }
    }

    return params;
}

export class WebService<Context> {
    public static makeAllowHeader<Context>(rsrc?: WebResource): string[] {
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

    public webServiceConfig: Required<WebServiceConfig>;

    private _mountPoint = '/';
    private _errorHandler?: WebErrorHandler<Context>;
    private _filters: Array<FilterDescriptor<Context>> = [];
    private _resources: Array<ResourceDescriptor<Context>> = [];
    private _resourcePattern?: RegExp;

    constructor(public context: Context, config?: WebServiceConfig) {
        this.webServiceConfig = {
            console:             console,
            trustForwardedFor:   false,
            trustForwardedHost:  false,
            trustForwardedProto: false,
            trustMethodOverride: true,
            ...config
        };
    }

    get webServiceMountPoint(): string {
        return this._mountPoint;
    }

    mount(mountPoint: string): this {
        if (!mountPoint.startsWith('/') || !mountPoint.endsWith('/')) {
            throw new TypeError(`Mount-point must both start and end with a slash; '${mountPoint}' does not`);
        }

        this._mountPoint = mountPoint;
        this._resourcePattern = undefined;

        return this;
    }

    unmount(): this {
        this._mountPoint = '/';
        this._resourcePattern = undefined;

        return this;
    }

    setErrorHandler(errorHandler: WebErrorHandler<Context> | undefined): this {
        this._errorHandler = errorHandler;

        return this;
    }

    addFilter(filter: WebFilterCtor<Context>): this {
        this._validatePath('WebFilter', filter.path.source);

        this._filters.push({ filter, pattern: null! });
        this._resourcePattern = undefined;

        return this;
    }

    addResource(resource: WebResourceCtor<Context>): this {
        const offset  = this._resources.length ? this._resources.length + this._resources[this._resources.length - 1].groups : 1;
        const source  = resource.path.source;
        const match   = RegExp('|' + source).exec('')!;
        const groups  = match.length - 1;
        const pattern = source.replace(/(^|[^\\])(\\\\)*\(\?<([a-zA-Z0-9]+)>/g, `$1$2(?<_${offset}_$3>`);

        this._validatePath('WebResource', source);

        this._resources[offset] = { resource, groups, pattern };
        this._resourcePattern = undefined;

        return this;
    }

    requestEventHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
        return async (req: IncomingMessage, res: ServerResponse) => {
            try {
                const webreq = new WebRequest(req, this.webServiceConfig);
                let webres: WebResponse;

                try {
                    this.webServiceConfig.console.info(`Rec'd ${webreq} from ${webreq.remoteAgent}`);
                    webres = await this.dispatchRequest(webreq);
                }
                catch (err) {
                    if (err instanceof WebException) {
                        webres = new WebResponse(err.status, { message: err.message }, err.headers);
                    }
                    else {
                        this.webServiceConfig.console.error(`Fail: ${webreq} from ${webreq.remoteAgent}: ${err}`);
                        this.webServiceConfig.console.debug(err);

                        webres = new WebResponse(WebStatus.INTERNAL_SERVER_ERROR, { message: 'Unexpected WebService/WebResource error' });
                    }
                }
                finally {
                    await webreq.close();
                }

                if (/^(HEAD|GET)$/.test(webreq.method) && webres.headers.etag && webres.headers.etag === req.headers['if-none-match']) {
                    await webres.close();
                    webres = new WebResponse(WebStatus.NOT_MODIFIED, null, webres.headers);
                }

                try {
                    webres.writeHead(res);

                    if (webreq.method !== 'HEAD') {
                        if (isReadableStream(webres.body)) {
                            this.webServiceConfig.console.info(`Send ${webres} to ${webreq.remoteAgent}`);
                        }

                        await webres.writeBody(res);
                    }

                    this.webServiceConfig.console.info(`Sent ${webres} to ${webreq.remoteAgent}`);
                }
                catch (err) {
                    this.webServiceConfig.console.warn(`${webres} could not be sent to ${webreq.remoteAgent}: ${err}`);
                }
                finally {
                    await webres.close();
                }
            }
            catch (err) {
                this.webServiceConfig.console.error(`Unexpected error in requestEventHandler`, err);
            }
            finally {
                res.end();
            }
        };
    }

    async dispatchRequest(webreq: WebRequest): Promise<WebResponse> {
        // Compile merged pattern
        if (!this._resourcePattern) {
            this._filters.forEach((filter) => { filter.pattern = RegExp(`^${this._mountPoint}${filter.filter.path.source}`); });
            this._resourcePattern = RegExp(`^${this._mountPoint}(?:${this._resources.filter((r) => !!r).map((r) => `(${r.pattern})`).join('|')})$`);
        }

        // Match incoming request
        const match = this._resourcePattern.exec(webreq.url.pathname);

        if (match) {
            // Find resource that matched
            for (const r in this._resources) {
                if (match[r] !== undefined) {
                    return this._handleResource(webreq, this._resources[r], Number(r), match);
                }
            }
        }

        return this._handleFilters(webreq, undefined, () => {
            throw new WebException(WebStatus.NOT_FOUND, `No resource matches the path ${webreq.url.pathname}`);
        });
    }

    private async _handleError(err: Error, errorHandler?: WebErrorHandler<Context> | ((err: Error, context: Context) => void)) {
        const handled = await errorHandler?.(err, this.context);

        if (handled) {
            return handled;
        }
        else {
            throw err;
        }
    }

    private async _handleFilters(webreq: WebRequest, resource: WebResource | undefined, resourceHandler: () => Promise<WebResponses>): Promise<WebResponse> {
        const matches = this._filters.map((desc) => ({ ctor: desc.filter, match: desc.pattern.exec(webreq.url.pathname)! })).filter((desc) => desc.match);
        const nextflt = async (): Promise<WebResponse> => {
            const active = matches.shift();
            const params = active && new WebArguments(regExpParams(active.match, 0, active.match.length, ''), webreq);
            const result = active
                ? await new active.ctor(params!, resource, this.context).filter(nextflt, params!, resource)
                : await resourceHandler();

            return result instanceof WebResponse ? result : new WebResponse(!!result ? WebStatus.OK : WebStatus.NO_CONTENT, result);
        };

        try {
            return await nextflt();
        }
        catch (err) {
            return this._handleError(err, this._errorHandler);
        }
    }

    private async _handleResource(webreq: WebRequest, desc: ResourceDescriptor<Context>, offset: number, match: RegExpExecArray): Promise<WebResponse> {
        const args = new WebArguments(regExpParams(match, offset, desc.groups, `_${offset}_`), webreq);
        const rsrc = new desc.resource(args, this.context);

        return this._handleFilters(webreq, rsrc, async () => {
            let method = ALLOWED_METHODS.test(webreq.method) ? (rsrc as any)[webreq.method] as typeof rsrc.default : undefined;

            if (!method && webreq.method === 'HEAD') {
                method = rsrc.GET;
            }

            method = method || rsrc.default;

            try {
                if (method) {
                    return await method.call(rsrc, args);
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
            catch (err) {
                return this._handleError(err, (err) => rsrc.catch?.(err));
            }
        });
    }

    private _validatePath(cls: string, source: string): void {
        if (source.startsWith('^') || source.endsWith('$')) {
            throw new TypeError(`${cls}.path should not include the start-of-line token ^ or the end-of-line token $`);
        }

        if (source.startsWith('\\/')) {
            throw new TypeError(`${cls}.path should not include leading slashes`);
        }
    }
}
