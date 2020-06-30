import { ContentType } from '@divine/headers';
import { BufferParser, EventStreamEvent, Parser } from '@divine/uri';
import { WebError, WebStatus } from './error';
import { WebArguments, WebFilter, WebResource } from './resource';
import { WebResponse, WebResponseHeaders } from './response';

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
        const origin   = args.string('@origin', undefined);

        if (this.isOriginAllowed(origin, params)) {
            const method = args.string('@access-control-request-method', undefined);

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
     * do that by throwing a [[WebError]] instead of returning `false`, like this:
     *
     * ```ts
     * protected isOriginAllowed(origin: string | undefined, params: CORSFilterParams): boolean {
     *     if (origin === 'https://example.com) {
     *         return true;
     *     }
     *     else {
     *         throw new WebError(WebStatus.FORBIDDEN, `CORS request from origin ${origin} denied`);
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

export const EVENT_ID    = Symbol('EVENT_ID');
export const EVENT_TYPE  = Symbol('EVENT_TYPE');
export const EVENT_RETRY = Symbol('EVENT_RETRY');

export interface EventAttributes {
    [EVENT_ID]?:    string;
    [EVENT_TYPE]?:  string;
    [EVENT_RETRY]?: number;
}

export class EventStreamResponse<T> extends WebResponse {
    private static async *eventStream<T>(source: AsyncIterable<T & EventAttributes>, dataType?: ContentType | string): AsyncGenerator<EventStreamEvent> {
        const serialize = async (event: object): Promise<string> => {
            const [, serialized] = Parser.serialize(dataType, event);

            return (serialized instanceof Buffer ? serialized : await new BufferParser(ContentType.bytes).parse(serialized)).toString();
        };

        try {
            for await (const event of source) {
                yield { id: event[EVENT_ID], event: event[EVENT_TYPE], retry: event[EVENT_RETRY], data: await serialize(event) };
            }
        }
        catch (err) {
            try {
                if (err instanceof WebError) {
                    yield { event: 'error', data: await serialize({ status: err.status, message: err.message }) };
                }
                else {
                    yield { event: 'error', data: await serialize({ status: WebStatus.INTERNAL_SERVER_ERROR, message: `Unexpected EventStream error` }) };
                }
            }
            catch (err2) {
                yield { event: 'error', data: err2.message }; // Inform client of error serialization errors ... as text/plain
            }
        }
    }

    constructor(source: AsyncIterable<T & EventAttributes>, dataType?: ContentType | string, headers?: WebResponseHeaders) {
        super(WebStatus.OK, EventStreamResponse.eventStream(source, dataType), {
            'content-type':      'text/event-stream',
            'cache-control':     'no-cache',
            'transfer-encoding': 'identity',
            ...headers
        });
    }
}
