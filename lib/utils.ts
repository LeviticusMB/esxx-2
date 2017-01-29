
import { Observable, Subscriber} from '@reactivex/rxjs';
import { PassThrough }           from 'stream';

export type ValueEncoder = (this: void, value: string) => string;

export interface Params {
    [key: string]: Object | string | number | boolean | null | undefined;
}

export function kvWrapper(wrapped: any): Params {
    return new Proxy(wrapped, {
        has: (target, prop) => {
            console.log(`kvWrapper.has ${prop} => ${target[prop] !== undefined}`);
            return target[prop] !== undefined;
        },

        get: (target, prop) => {
            console.log(`kvWrapper.get ${prop} => ${target[prop]}`);
            return target[prop];
        },
    });
}

export function es6Encoder(strings: TemplateStringsArray, values: any[], encoder: ValueEncoder) {
    let result = strings[0];

    for (let i = 0; i < values.length; ++i) {
        result += encoder(String(values[i])) + strings[i + 1];
    }

    return result;
}

export function esxxEncoder(template: string, params: Params, encoder: ValueEncoder) {
    return template.replace(/(^|[^\\])(\\\\)*{([^{} \f\n\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+)}/g, (match) => {
        const start = match.lastIndexOf('{');
        const value = params[match.substring(start + 1, match.length - 1)];

        return match.substring(0, start) + (value !== undefined ? encoder(String(value)) : '');
    });
}

export function toObservable(charset: string, readable: NodeJS.ReadableStream) {
    return new Observable<Buffer>((observer: Subscriber<Buffer>): Function => {
        const onData  = (data: Buffer | string) => observer.next(data instanceof Buffer ? data : Buffer.from(data.toString(), charset));
        const onError = (error: Error)          => observer.error(error);
        const onEnd   = ()                      => observer.complete();

        readable.on('data',  onData);
        readable.on('error', onError);
        readable.on('end',   onEnd);

        return () => {
            readable.removeListener('data',  onData);
            readable.removeListener('error', onError);
            readable.removeListener('end',   onEnd);
        };
    });
}

export function toReadableStream(observable: Observable<Buffer>): NodeJS.ReadableStream {
    const passthrough = new PassThrough({});

    observable.subscribe({
        next(data)   { passthrough.write(data);          },
        error(error) { passthrough.emit('error', error); },
        complete()   { passthrough.end();                },
    });

    return passthrough;
}
