import { WebArguments, WebFilter, WebResource } from './resource';
import { WebResponse } from './response';

function asSet(array: string | string[] | undefined): Set<string> {
    return new Set(typeof array === 'string' ? array.split(/\s*,\s*/) : array ?? []);
}

export interface CORSFilterParams {
    args:     WebArguments;
    resource: WebResource;
    response: WebResponse;
}

export abstract class CORSFilter implements WebFilter {
    protected static excluded = new Set(['cache-control', 'content-language', 'content-type', 'expires', 'last-modified', 'pragma']);

    async filter(next: () => Promise<WebResponse>, args: WebArguments, resource: () => Promise<WebResource>) {
        const response = await next();
        const exposed  = Object.keys(response.headers); // Read before we add any extra
        const params   = { args, resource: await resource(), response };
        const origin   = args.optional('@origin');

        if (this.isOriginAllowed(origin, params)) {
            const method = args.optional('@access-control-request-method');

            if (method !== undefined && args.request.method === 'OPTIONS') { // Preflight
                const methods = asSet(response.headers.allow).add(method);
                const headers = args.string('@access-control-request-headers', '').split(/\s*,\s*/);

                response
                    .setHeader('access-control-allow-methods',  [...methods].filter((h) => this.isMethodAllowed(h, params)).join(', '))
                    .setHeader('access-control-allow-headers',  headers.filter((h) => this.isHeaderAllowed(h, params)).join(', '))
                    .setHeader('access-control-max-age',        this.getMaxAge(params));
                }

            if (this.isCredentialsSupported(params)) {
                response.setHeader('access-control-allow-credentials', 'true');
            }

            response
                .setHeader('access-control-allow-origin',   origin)
                .setHeader('access-control-expose-headers', exposed.filter((h) => this.isHeaderExposed(h, params)).join(', '))
                .setHeader('vary',                          [...asSet(response.headers.vary).add('origin')].join(', '));
        }

        return response;
    }

    /**
     * Check if the given `origin` is allowed to make a CORS request.
     *
     * The CORS specification recommends a server to return [[WebStatus.FORBIDDEN]] if a CORS request is denied. You can
     * do that by throwing a [[WebException]] instead of returning `false`, like this:
     *
     * ```ts
     * protected isOriginAllowed(origin: string | undefined, params: CORSFilterParams): boolean {
     *     if (origin === 'https://example.com) {
     *         return true;
     *     }
     *     else {
     *         throw new WebException(WebStatus.FORBIDDEN, `CORS request from origin ${origin} denied`);
     *     }
     * }
     * ```
     *
     * @param origin The value of the origin header, or undefined if the header was not provided.
     * @param params Request params.
     *
     * @returns `true` if the request is allowed, else `false`.
     */
    protected isOriginAllowed(origin: string | undefined, params: CORSFilterParams): boolean {
        return origin !== undefined;
    }

    protected isMethodAllowed(method: string, params: CORSFilterParams): boolean {
        return true;
    }

    protected isHeaderAllowed(header: string, params: CORSFilterParams): boolean {
        return true;
    }

    protected isHeaderExposed(header: string, params: CORSFilterParams): boolean {
        return !CORSFilter.excluded.has(header);
    }

    protected isCredentialsSupported(params: CORSFilterParams): boolean {
        return false;
    }

    protected getMaxAge(params: CORSFilterParams): number {
        return 600;
    }
}
