import { EventEmitter } from 'events';
import { Transform, TransformCallback, TransformOptions } from 'stream';

const PATCHED_CONSOLE_METHODS = [
    /* Console */    'assert', 'debug', 'dirxml', 'error', 'group', 'groupCollapsed', 'info', 'log', 'timeLog', 'trace', 'warn',
    /* SysConsole */ 'alert', 'crit', 'emerg', 'notice',
].reduce((map, fn) => (map[fn] = true, map), {} as { [fn: string]: true | undefined });

export function decorateConsole(console: Console, tag: string): Console {
    return new Proxy(console, {
        get: (target, p: string, receiver) => {
            const value = Reflect.get(target, p, receiver);

            if (typeof value === 'function' && PATCHED_CONSOLE_METHODS[p]) {
                return function (this: unknown, ...args: unknown[]) { return value.call(this, ...args, tag); };
            }
            else {
                return value;
            }
        }
    });
}

export function isReadableStream(obj: any): obj is NodeJS.ReadableStream;
export function isReadableStream(obj: NodeJS.ReadableStream): obj is NodeJS.ReadableStream {
    return obj instanceof EventEmitter && typeof obj.readable === 'boolean' && typeof obj.read === 'function';
}

export function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export class SizeLimitedReadableStream extends Transform {
    private count = 0;

    constructor(private maxContentLength: number, private makeError: () => Error, opts?: TransformOptions) {
        super(opts);
    }

    _transform(chunk: any, _encoding: string, callback: TransformCallback): void {
        if (chunk instanceof Buffer || typeof chunk === 'string') {
            this.count += chunk.length;

            if (this.count > this.maxContentLength) {
                callback(this.makeError());
            }
            else {
                callback(null, chunk);
            }
        }
        else {
            callback(new Error('Expected Buffer or string chunk'));
        }
    }

    _flush(callback: TransformCallback): void {
        callback();
    }
}
