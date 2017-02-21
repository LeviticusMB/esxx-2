
import { Readable } from 'stream';

export type ValueEncoder = (this: void, value: string) => string;

export interface Params {
    [key: string]: object | string | number | boolean | null | undefined;
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

export function toAsyncIterable(readable: NodeJS.ReadableStream, charset?: string): typeof readable & AsyncIterable<Buffer> {
    (readable as any)[Symbol.asyncIterator] = async function* () {
        while (true) {
            let data = await readChunk(readable);

            if (data !== null) {
                if (!(data instanceof Buffer)) {
                    data = Buffer.from(data.toString(), charset);
                }

                yield data;
            }
            else {
                break;
            }
        }
    };

    return readable as NodeJS.ReadableStream & AsyncIterable<Buffer>;
}

export class IteratorStream extends Readable {
    private iterator: AsyncIterator<Buffer>;
    private done = false;

    constructor(private stream: AsyncIterable<Buffer>) {
        super({ encoding: undefined, objectMode: false });
    }

    async _read(size: number): Promise<void> {
        try {
            while (size > 0 && !this.done) {
                if (!this.iterator) {
                    this.iterator = this.stream[Symbol.asyncIterator]();
                }

                const next = await this.iterator.next();

                if (next.done) {
                    this.done = true;
                    this.push(null);
                }
                else {
                    size -= next.value.length;

                    if (!this.push(next.value)) {
                        break;
                    }
                }
            }
        }
        catch (error) {
            process.nextTick(() => this.emit('error', error));
        }
    }
}

export function readChunk(stream: NodeJS.ReadableStream): Promise<Buffer | string | null> {
    return new Promise<Buffer | string | null>((resolve, reject) => {
        const data = stream.read();

        if (data !== null) {
            resolve(data);
        }
        else {
            const end = () => {
                cleanup();
                resolve(null);
            };

            const error = (err: Error) => {
                cleanup();
                reject(err);
            };

            const readable = () => {
                cleanup();
                resolve(readChunk(stream));
            };

            const cleanup = () => {
                stream.removeListener('end', end);
                stream.removeListener('error', error);
                stream.removeListener('readable', readable);
            };

            stream.on('readable', readable).on('end', end).on('error', error);
        }
    });
}

export function copyStream(from: NodeJS.ReadableStream, to: NodeJS.WritableStream): Promise<typeof to> {
    return new Promise<typeof to>((resolve, reject) => {
        from.pipe(to)
            .once('finish', () => resolve(to))
            .once('error', reject);
    });
}
