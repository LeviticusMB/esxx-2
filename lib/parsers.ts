
import { Observable, Subscriber}     from '@reactivex/rxjs';
import { ContentType, URIException } from './utils';

export abstract class Parser {
    static register(baseType: string, parser: typeof Parser): typeof Parser {
        Parser.parsers.set(baseType, parser);
        return Parser;
    }

    static parse(contentType: ContentType, observable: Observable<Buffer>): Promise<any> {
        const parser = Parser.parsers.get(contentType.baseType()) || BufferParser;

        return new (parser as any)(contentType).parse(observable);
    }

    static async serialize(contentType: ContentType | string | undefined, data: any): Promise<[ContentType, Observable<Buffer>]> {
        while (data instanceof Promise) {
            data = await data;
        }

        if (data === null || data === undefined) {
            data = Buffer.alloc(0);
        }

        contentType = ContentType.create(contentType,
            data instanceof Buffer ? ContentType.bytes :
            data instanceof Array || data.__proto__ === Object.prototype ? ContentType.json :
            ContentType.text);

        const parser = Parser.parsers.get(contentType.baseType()) || BufferParser;

        return [contentType, new (parser as any)(contentType).serialize(data)];
    }

    private static parsers = new Map<string, typeof Parser>();

    constructor(protected contentType: ContentType) { }
    abstract parse(observable: Observable<Buffer>): Promise<any>;
    abstract serialize(data: any): Observable<Buffer>;

    protected assertSerializebleData(condition: boolean, data: any): void {
        if (!condition) {
            const type = data instanceof Object ? data.__proto__.constructor.name : data === 'null' ? 'null' : typeof data;

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

    serialize(data: any): Observable<Buffer> {
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

    serialize(data: any): Observable<Buffer> {
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

    serialize(data: any): Observable<Buffer> {
        return new StringParser(this.contentType).serialize(JSON.stringify(data));
    }
}

Parser
    .register('application/json',         JSONParser)
    .register('application/octet-stream', BufferParser)
    .register('text/plain',               StringParser)
;
