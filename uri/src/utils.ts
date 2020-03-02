import { EventEmitter, pipeline, Readable } from 'stream';

export type Constructor<T> = new (...args: any[]) => T;
export type ValueEncoder = (this: void, value: string) => string;

export interface Params {
    [key: string]: object | string | number | boolean | null | undefined;
}

export function kvWrapper(wrapped: any): Params {
    return new Proxy(wrapped, {
        has: (target: any, prop: any) => {
            console.log(`kvWrapper.has ${prop} => ${target[prop] !== undefined}`);
            return target[prop] !== undefined;
        },

        get: (target: any, prop: any) => {
            console.log(`kvWrapper.get ${prop} => ${target[prop]}`);
            return target[prop];
        },
    });
}

export function es6Encoder(strings: TemplateStringsArray, values: unknown[], encoder: ValueEncoder) {
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

export async function *toAsyncIterable(data: string | Buffer | AsyncIterable<Buffer | string>): AsyncIterable<Buffer> {
    if (data instanceof Buffer) {
        yield data;
    }
    else if (isAsyncIterable(data)) {
        for await (const chunk of data) {
            yield chunk instanceof Buffer ? chunk : Buffer.from(chunk);
        }
    }
    else {
        yield Buffer.from(data);
    }
}

export function toReadableStream(data: string | Buffer | AsyncIterable<Buffer | string>): Readable {
    if (typeof data === 'string' || data instanceof Buffer) {
        return Readable.from(toAsyncIterable(data));
    }
    else {
        return Readable.from(data);
    }
}

export function copyStream(from: NodeJS.ReadableStream, to: NodeJS.WritableStream): Promise<typeof to> {
    return new Promise<typeof to>((resolve, reject) => {
        pipeline(from, to, (err) => err ? reject(err) : resolve(to));
    });
}

export function isAsyncIterable<T = unknown>(object: any): object is AsyncIterable<T> {
    return typeof object[Symbol.asyncIterator] === 'function';
}

export function isReadableStream(obj: any): obj is NodeJS.ReadableStream;
export function isReadableStream(obj: NodeJS.ReadableStream): obj is NodeJS.ReadableStream {
    return obj instanceof EventEmitter && typeof obj.readable === 'boolean' && typeof obj.read === 'function';
}

export function isDOMNode(obj: unknown): obj is Node {
    return !!obj && typeof (obj as Node).nodeType === 'number'; /* FIXME */
}

export function isJSON(obj: unknown): boolean {
    return obj instanceof Array || !!obj && Object.getPrototypeOf(obj) === Object.prototype;
}

export function b64Decode(b64: string): string {
    return Buffer.from(b64, 'base64').toString();
}

export function b64Encode(str: string): string {
    return Buffer.from(str).toString('base64');
}
