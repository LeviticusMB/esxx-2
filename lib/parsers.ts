
import { Observable, Subscriber}     from '@reactivex/rxjs';
import { ContentType, URIException } from './utils';

export abstract class Parser {
    private static parsers = new Map<string, typeof Parser>();

    constructor(protected contentType: ContentType) { }
    abstract parse(observable: Observable<Buffer | string>): Promise<any>;
    abstract serialize(payload: any): Observable<Buffer | string>;

    protected assertSerializeblePayload(condition: boolean, payload: any): void {
        if (!condition) {
            let type = payload instanceof Object ? payload.__proto__.constructor.name : payload === 'null' ? 'null' : typeof payload;

            throw new URIException(`${this.constructor.name} cannot serialize ${type} as ${this.contentType.baseType()}`, undefined, payload);
        }
    }

    static parse(contentType: ContentType, observable: Observable<Buffer | string>): Promise<any> {
        let parser = Parser.parsers.get(contentType.baseType()) || BufferParser;

        return new (parser as any)(contentType).parse(observable);
    }

    static serialize(contentType: ContentType, payload: any): Observable<Buffer | string> {
        if (payload === null || payload === undefined) {
            payload = '';
        }

        let parser = Parser.parsers.get(contentType.baseType()) || BufferParser;

        return new (parser as any)(contentType).serialize(payload);
    }

    static register(baseType: string, parser: typeof Parser) : typeof Parser {
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

    serialize(payload: Buffer | string): Observable<Buffer> {
        return new Observable<Buffer>((observer: Subscriber<Buffer | string>): void => {
            this.assertSerializeblePayload(typeof payload === 'string' || payload instanceof Buffer, payload);

            observer.next(typeof payload === 'string' ? Buffer.from(payload) : payload);
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

    serialize(payload: string | number | String | Number): Observable<string> {
        return new Observable<string>((observer: Subscriber<Buffer | string>): void => {
            this.assertSerializeblePayload(payload !== null && payload !== undefined, payload);

            observer.next(payload.toString());
            observer.complete();
        });
    }
}

Parser
    .register('text/plain',               StringParser)
    .register('application/octet-stream', BufferParser)
;
