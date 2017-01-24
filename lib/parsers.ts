
import { Observable, Subscriber}     from '@reactivex/rxjs';
import { ContentType, URIException } from './utils';

export abstract class Parser {
    private static parsers = new Map<string, typeof Parser>();

    constructor(protected contentType: ContentType) { }
    abstract parse(observable: Observable<Buffer | string>): Promise<any>;
    abstract serialize(data: any): Observable<Buffer | string>;

    protected assertSerializebleData(condition: boolean, data: any): void {
        if (!condition) {
            let type = data instanceof Object ? data.__proto__.constructor.name : data === 'null' ? 'null' : typeof data;

            throw new URIException(`${this.constructor.name} cannot serialize ${type} as ${this.contentType.baseType()}`, undefined, data);
        }
    }

    static parse(contentType: ContentType, observable: Observable<Buffer | string>): Promise<any> {
        let parser = Parser.parsers.get(contentType.baseType()) || BufferParser;

        return new (parser as any)(contentType).parse(observable);
    }

    static async serialize(contentType: ContentType | string | undefined, data: any): Promise<[ContentType, Observable<Buffer | string>]> {
        if (data instanceof Promise) {
            data = await data;
        }

        contentType = ContentType.create(contentType,
            data instanceof String || typeof data === 'string'                    ? ContentType.text :
            data instanceof Number || typeof data === 'number'                    ? ContentType.text :
            data instanceof Array  || data && data.__proto__ === Object.prototype ? ContentType.json :
            ContentType.bytes);

        if (data === null || data === undefined) {
            data = '';
        }

        let parser = Parser.parsers.get(contentType.baseType()) || BufferParser;

        return [contentType, new (parser as any)(contentType).serialize(data)];
    }

    static register(baseType: string, parser: typeof Parser): typeof Parser {
        Parser.parsers.set(baseType, parser);
        return Parser;
    }
}

export class BufferParser extends Parser {
    parse(observable: Observable<Buffer | string>): Promise<Buffer> {
        let ct = this.contentType.param('charset', 'utf8');
        let result = Buffer.alloc(0);

        return new Promise((resolve, reject) => {
            observable
                .forEach((next) => {
                    result = Buffer.concat([result, next instanceof Buffer ? next : Buffer.from(next.toString(), ct)]);
                })
                .then(() => resolve(result), reject);
        });
    }

    serialize(data: Buffer | string): Observable<Buffer> {
        return new Observable<Buffer>((observer: Subscriber<Buffer | string>): void => {
            this.assertSerializebleData(typeof data === 'string' || data instanceof Buffer, data);

            observer.next(typeof data === 'string' ? Buffer.from(data) : data);
            observer.complete();
        });
    }
}

export class StringParser extends Parser {
    parse(observable: Observable<Buffer | string>): Promise<string> {
        let ct = this.contentType.param('charset', 'utf8');
        let result = '';

        return new Promise((resolve, reject) => {
            observable
                .forEach((next) => {
                    result += next instanceof Buffer ? next.toString(ct) : next.toString();
                })
                .then(() => resolve(result), reject);
        });
    }

    serialize(data: string | number | String | Number): Observable<string> {
        return new Observable<string>((observer: Subscriber<Buffer | string>): void => {
            this.assertSerializebleData(data !== null && data !== undefined, data);

            observer.next(data.toString());
            observer.complete();
        });
    }
}

Parser
    .register('text/plain',               StringParser)
    .register('application/octet-stream', BufferParser)
;
