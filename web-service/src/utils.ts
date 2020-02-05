import { EventEmitter } from 'events';
import { Transform, TransformCallback, TransformOptions } from 'stream';

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
