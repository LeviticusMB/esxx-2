
import { ContentType } from '@divine/headers';
import { DOMParser, XMLSerializer } from 'xmldom';
import { NULL, URIException, VOID } from './uri';

export function isDOMNode(obj: unknown): obj is Node {
    return !!obj && typeof (obj as Node).nodeType === 'number'; /* FIXME */
}

export function isJSON(obj: unknown): boolean {
    return obj instanceof Array || !!obj && Object.getPrototypeOf(obj) === Object.prototype;
}

export abstract class Parser {
    static register(baseType: string, parser: typeof Parser): typeof Parser {
        Parser.parsers.set(baseType, parser);
        return Parser;
    }

    static async parse(contentType: ContentType, stream: AsyncIterable<Buffer>): Promise<object> {
        try {
            const result = Parser.create(contentType).parse(stream);

            // Never return primitive types or null/undefined
            return result === undefined       ? Object(VOID) :
                   result === null            ? Object(NULL) :
                   typeof result !== 'object' ? Object(result) :
                   result;
        }
        catch (ex) {
            throw new URIException(`${contentType} parser failed: ${ex}`, ex);
        }
    }

    static async serialize(contentType: ContentType | string | undefined,
                           data: unknown): Promise<[ContentType, AsyncIterableIterator<Buffer>]> {
        try {
            while (data instanceof Promise) {
                data = await data;
            }

            if (data === null || data === undefined) {
                data = Buffer.alloc(0);
            }

            contentType = ContentType.create(contentType,
                data instanceof Buffer ? ContentType.bytes :
                isJSON(data)           ? ContentType.json :
                isDOMNode(data)        ? ContentType.xml :
                ContentType.text);

            return [contentType, Parser.create(contentType).serialize(data)];
        }
        catch (ex) {
            throw new URIException(`${contentType} serializer failed: ${ex}`, ex);
        }
    }

    private static parsers = new Map<string, typeof Parser>();

    private static create(contentType: ContentType): Parser {
        return new (Parser.parsers.get(contentType.type) as any || BufferParser)(contentType);
    }

    constructor(protected contentType: ContentType) { }
    abstract parse(stream: AsyncIterable<Buffer>): Promise<unknown>;
    abstract serialize(data: unknown): AsyncIterableIterator<Buffer>;

    protected assertSerializebleData(condition: boolean, data: unknown): void {
        if (!condition) {
            const type = data instanceof Object ? Object.getPrototypeOf(data).constructor.name : data === null ? 'null' : typeof data;

            throw new URIException(`${this.constructor.name} cannot serialize ${type} as ${this.contentType.type}`,
                undefined, Object(data));
        }
    }
}

export class BufferParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<Buffer> {
        let result = Buffer.alloc(0);

        for await (const chunk of stream) {
            result = Buffer.concat([result, chunk]);
        }

        return result;
    }

    async* serialize(data: unknown): AsyncIterableIterator<Buffer> {
        yield* new StringParser(this.contentType).serialize(data);
    }
}

export class StringParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<string> {
        const cs = this.contentType.param('charset', 'utf8');
        let result = '';

        for await (const chunk of stream) {
            result += chunk.toString(cs);
        }

        return result;
    }

    async *serialize(data: unknown): AsyncIterableIterator<Buffer> {
        const cs = this.contentType.param('charset', 'utf8') as BufferEncoding; // TODO: Encoding
        this.assertSerializebleData(data !== null && data !== undefined, data);

        yield data instanceof Buffer ? data : Buffer.from(String(data), cs);
    }
}

export class JSONParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<boolean | number | null | string | object> {
        return JSON.parse(await new StringParser(this.contentType).parse(stream));
    }

    async *serialize(data: unknown): AsyncIterableIterator<Buffer> {
        try {
            data = JSON.stringify(data);
        }
        catch (ex) {
            this.assertSerializebleData(false, data);
        }

        yield* new StringParser(this.contentType).serialize(data);
    }
}

export class XMLParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<Document> {
        return new DOMParser().parseFromString(await new StringParser(this.contentType).parse(stream));
    }

    async *serialize(data: unknown): AsyncIterableIterator<Buffer> {
        this.assertSerializebleData(isDOMNode(data), data);

        yield* new StringParser(this.contentType).serialize(new XMLSerializer().serializeToString(data as Node));
    }
}

Parser
    .register('application/json',         JSONParser)
    .register('application/octet-stream', BufferParser)
    .register('application/xml',          XMLParser)
    .register('text/plain',               StringParser)
    .register('text/xml',                 XMLParser)
;
