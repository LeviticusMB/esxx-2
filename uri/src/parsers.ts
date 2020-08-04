import { ContentType } from '@divine/headers';
import iconv from 'iconv-lite';
import { Finalizable, IOError, NULL, VOID } from './uri';
import { isAsyncIterable, isDOMNode, isJSON, isReadableStream, toAsyncIterable, BasicTypes } from './utils';

export function toObject<T extends object>(result: unknown): T {
    return result === undefined       ? Object(VOID) :
           result === null            ? Object(NULL) :
           typeof result !== 'object' ? Object(result) :
           result;
}

export function toPrimitive(value: any): BasicTypes | symbol | undefined {
    if (value !== null && value !== undefined) {
        value = value.valueOf();
    }

    return value === NULL ? null : value === VOID ? undefined : value;
}

export class ParserError extends IOError {
}

export abstract class Parser {
    static register(baseType: string, parser: typeof Parser): typeof Parser {
        Parser.parsers.set(baseType, parser);
        return Parser;
    }

    static async parse<T extends object>(stream: Buffer | AsyncIterable<Buffer> | string, contentType: ContentType | string): Promise<T & Finalizable> {
        try {
            const result = await Parser.create(ContentType.create(contentType)).parse(toAsyncIterable(stream));

            // Never return primitive types or null/undefined
            return toObject(result);
        }
        catch (err) {
            throw new ParserError(`${contentType} parser failed: ${err.message}`, err);
        }
    }

    static serialize(data: unknown, contentType?: ContentType | string): [Buffer | AsyncIterable<Buffer>, ContentType] {
        try {
            data = toPrimitive(data); // Unpack values wrapped by toObject()

            contentType = ContentType.create(contentType,
                data instanceof Buffer        ? ContentType.bytes :
                isReadableStream(data)        ? ContentType.bytes :
                isJSON(data) || data === null ? ContentType.json :
                isDOMNode(data)               ? ContentType.xml :
                ContentType.text);

            // Pass Buffer and ReadableStream right through, ignoring `contentType`; serialize everything else
            return [data instanceof Buffer || isReadableStream(data) ? toAsyncIterable(data) : Parser.create(contentType).serialize(data), contentType];
        }
        catch (err) {
            throw new ParserError(`${contentType} serializer failed: ${err.message}`, err);
        }
    }

    private static parsers = new Map<string, typeof Parser>();

    private static create(contentType: ContentType): Parser {
        return new (Parser.parsers.get(contentType.type) ??
                    Parser.parsers.get(contentType.type.replace(/\/.*/, '/*')) ??
                    BufferParser as any)(contentType);
    }

    constructor(protected contentType: ContentType) { }
    abstract parse(stream: AsyncIterable<Buffer>): Promise<unknown>;
    abstract serialize(data: unknown): Buffer | AsyncIterable<Buffer>;

    protected assertSerializebleData(condition: boolean, data: unknown, cause?: Error): asserts condition {
        if (!condition) {
            const type = data instanceof Object ? Object.getPrototypeOf(data).constructor.name : data === null ? 'null' : typeof data;

            throw new ParserError(`${this.constructor.name} cannot serialize ${type} as ${this.contentType.type}`, cause, toObject(data));
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

    serialize(data: Buffer | AsyncIterable<Buffer>): Buffer | AsyncIterable<Buffer> {
        this.assertSerializebleData(data instanceof Buffer || isAsyncIterable(data), data);

        return data instanceof Buffer ? data : toAsyncIterable(data);
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

        return iconv.encode(String(data), charset, { addBOM: bom === 'present'});
    }
}

Parser
    .register('application/octet-stream', BufferParser)
    .register('text/plain',               StringParser)
;
