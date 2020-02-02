import { ContentType } from '@divine/headers';
import TOML from '@iarna/toml';
import iconv from 'iconv-lite';
import { DOMParser, XMLSerializer } from 'xmldom';
import { NULL, URIException, VOID } from './uri';
import { isAsyncIterable, isDOMNode, isJSON } from './utils';

export function toObject(result: unknown) {
    return result === undefined       ? Object(VOID) :
           result === null            ? Object(NULL) :
           typeof result !== 'object' ? Object(result) :
           result;
}

export abstract class Parser {
    static register(baseType: string, parser: typeof Parser): typeof Parser {
        Parser.parsers.set(baseType, parser);
        return Parser;
    }

    static async parse(contentType: ContentType, stream: AsyncIterable<Buffer>): Promise<object> {
        try {
            const result = await Parser.create(contentType).parse(stream);

            // Never return primitive types or null/undefined
            return toObject(result);
        }
        catch (ex) {
            throw new URIException(`${contentType} parser failed: ${ex}`, ex);
        }
    }

    static serialize(contentType: ContentType | string | undefined,
                     data: unknown): [ContentType, Buffer | AsyncIterableIterator<Buffer>] {
        try {
            contentType = ContentType.create(contentType,
                data instanceof Buffer ? ContentType.bytes :
                isJSON(data)           ? ContentType.json :
                isDOMNode(data)        ? ContentType.xml :
                ContentType.text);

            const serialized = Parser.create(contentType).serialize(data);
            return [contentType, isAsyncIterable(serialized) ? serialized : serialized];
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
    abstract serialize(data: unknown): Buffer | AsyncIterableIterator<Buffer>;

    protected assertSerializebleData(condition: boolean, data: unknown, cause?: Error): void {
        if (!condition) {
            const type = data instanceof Object ? Object.getPrototypeOf(data).constructor.name : data === null ? 'null' : typeof data;

            throw new URIException(`${this.constructor.name} cannot serialize ${type} as ${this.contentType.type}`, cause, toObject(data));
        }
    }
}

export class BufferParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<Buffer> {
        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        return Buffer.concat(chunks);
    }

    serialize(data: unknown): Buffer {
        return new StringParser(this.contentType).serialize(data);
    }
}

export class StringParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<string> {
        const charset = this.contentType.param('charset', 'utf8');
        const bom     = this.contentType.param('x-bom',   'absent');
        const chunks  = [];

        for await (const chunk of stream) {
            chunks.push(iconv.decode(chunk, charset, { stripBOM: chunks.length === 0 && bom === 'absent' }));
        }

        return chunks.join('');
    }

    serialize(data: unknown): Buffer {
        const charset = this.contentType.param('charset', 'utf8');
        const bom     = this.contentType.param('x-bom',   'absent');
        this.assertSerializebleData(data !== null && data !== undefined, data);

        return data instanceof Buffer ? data : iconv.encode(String(data), charset, { addBOM: bom === 'present'});
    }
}

export class JSONParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<boolean | number | null | string | object> {
        return JSON.parse(await new StringParser(this.contentType).parse(stream));
    }

    serialize(data: unknown): Buffer {
        try {
            data = JSON.stringify(data);
        }
        catch (ex) {
            this.assertSerializebleData(false, data, ex);
        }

        return new StringParser(this.contentType).serialize(data);
    }
}

export class TOMLParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<TOML.JsonMap> {
        return TOML.parse(await new StringParser(this.contentType).parse(stream));
    }

    serialize(data: unknown): Buffer {
        this.assertSerializebleData(data !== null && data !== undefined && !(data instanceof Date), data);

        try {
            if (typeof data === 'object' && !Array.isArray(data)) {
                data = TOML.stringify(data as TOML.JsonMap);
            }
            else {
                data = TOML.stringify.value(data as TOML.AnyJson);
            }
        }
        catch (ex) {
            this.assertSerializebleData(false, data, ex);
        }

        return new StringParser(this.contentType).serialize(data);
    }
}

export class XMLParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<Document> {
        return new DOMParser().parseFromString(await new StringParser(this.contentType).parse(stream));
    }

    serialize(data: unknown): Buffer {
        this.assertSerializebleData(isDOMNode(data), data);

        return new StringParser(this.contentType).serialize(new XMLSerializer().serializeToString(data as Node));
    }
}

Parser
    .register('application/json',         JSONParser)
    .register('application/octet-stream', BufferParser)
    .register('application/toml',         TOMLParser)
    .register('application/xml',          XMLParser)
    .register('text/plain',               StringParser)
    .register('text/xml',                 XMLParser)
;
