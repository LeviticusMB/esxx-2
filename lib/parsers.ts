
import { Observable, Subscriber}     from '@reactivex/rxjs';
import { DOMParser, XMLSerializer }  from 'xmldom';
import { ContentType, URIException } from './uri';

export type ObjectOrPrimitive = Object | string | number | boolean;

function isDOMNode(obj: ObjectOrPrimitive): obj is Node {
    return !!obj && typeof (obj as Node).nodeType === 'number'; /* FIXME */
}

function isJSON(obj: ObjectOrPrimitive): boolean {
    return obj instanceof Array || !!obj && Object.getPrototypeOf(obj) === Object.prototype;
}

export abstract class Parser {
    static register(baseType: string, parser: typeof Parser): typeof Parser {
        Parser.parsers.set(baseType, parser);
        return Parser;
    }

    static async parse(contentType: ContentType, observable: Observable<Buffer>): Promise<Object> {
        const parser = Parser.parsers.get(contentType.baseType()) || BufferParser;
        const result = await new (parser as any)(contentType).parse(observable);

        // Never return primitive types
        return result instanceof Object ? result : Object(result);
    }

    static async serialize(contentType: ContentType | string | undefined,
                           data: ObjectOrPrimitive | null | undefined): Promise<[ContentType, Observable<Buffer>]> {
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

        const parser = Parser.parsers.get(contentType.baseType()) || BufferParser;

        return [contentType, new (parser as any)(contentType).serialize(data)];
    }

    private static parsers = new Map<string, typeof Parser>();

    constructor(protected contentType: ContentType) { }
    abstract parse(observable: Observable<Buffer>): Promise<ObjectOrPrimitive>;
    abstract serialize(data: ObjectOrPrimitive): Observable<Buffer>;

    protected assertSerializebleData(condition: boolean, data: ObjectOrPrimitive): void {
        if (!condition) {
            const type = data instanceof Object ? Object.getPrototypeOf(data).constructor.name : data === null ? 'null' : typeof data;

            throw new URIException(`${this.constructor.name} cannot serialize ${type} as ${this.contentType.baseType()}`, undefined, data);
        }
    }
}

export class BufferParser extends Parser {
    async parse(observable: Observable<Buffer>): Promise<Buffer> {
        let result = Buffer.alloc(0);

        await observable.forEach((next) => {
            result = Buffer.concat([result, next]);
        });

        return result;
    }

    serialize(data: ObjectOrPrimitive): Observable<Buffer> {
        return new StringParser(this.contentType).serialize(data);
    }
}

export class StringParser extends Parser {
    async parse(observable: Observable<Buffer>): Promise<string> {
        const cs = this.contentType.param('charset', 'utf8');
        let result = '';

        await observable.forEach((next) => {
            result += next.toString(cs);
        });

        return result;
    }

    serialize(data: ObjectOrPrimitive): Observable<Buffer> {
        return new Observable<Buffer>((observer: Subscriber<Buffer>): void => {
            this.assertSerializebleData(data !== null && data !== undefined, data);

            const cs = this.contentType.param('charset', 'utf8');
            observer.next(data instanceof Buffer ? data : Buffer.from(data.toString(), cs));
            observer.complete();
        });
    }
}

export class JSONParser extends Parser {
    async parse(observable: Observable<Buffer>): Promise<Object> {
        return JSON.parse(await new StringParser(this.contentType).parse(observable));
    }

    serialize(data: ObjectOrPrimitive): Observable<Buffer> {
        return new StringParser(this.contentType).serialize(JSON.stringify(data));
    }
}

export class XMLParser extends Parser {
    async parse(observable: Observable<Buffer>): Promise<Document> {
        return new DOMParser().parseFromString(await new StringParser(this.contentType).parse(observable));
    }

    serialize(data: ObjectOrPrimitive): Observable<Buffer> {
        this.assertSerializebleData(isDOMNode(data), data);
        return new StringParser(this.contentType).serialize(new XMLSerializer().serializeToString(data as Node));
    }
}

Parser
    .register('application/json',         JSONParser)
    .register('application/octet-stream', BufferParser)
    .register('application/xml',          XMLParser)
    .register('text/plain',               StringParser)
    .register('text/xml',                 XMLParser)
;
