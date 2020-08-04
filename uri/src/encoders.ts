import { Transform } from 'stream';
import { createBrotliCompress, createBrotliDecompress, createDeflate, createGunzip, createGzip, createInflate } from 'zlib';
import { IOError } from './uri';
import { isAsyncIterable, toAsyncIterable, toReadableStream } from './utils';

export class EncoderError extends IOError {
}

export abstract class Encoder {
    static register(type: string, encoder: typeof Encoder): typeof Encoder {
        Encoder.encoders.set(type, encoder);
        return Encoder;
    }

    static encode(stream: Buffer | AsyncIterable<Buffer> | string, types: string | string[]): AsyncIterable<Buffer> {
        stream = isAsyncIterable(stream) ? stream : toAsyncIterable(stream);
        types  = typeof types === 'string' ? types.trim().split(/\s*,\s*/) : types;

        try {
            for (const type of types) {
                stream = Encoder.create(type).encode(stream);
            }

            return stream;
        }
        catch (err) {
            throw new EncoderError(`'${types}' encoder failed`, err);
        }
    }

    static decode(stream: Buffer | AsyncIterable<Buffer> | string, types: string | string[]): AsyncIterable<Buffer> {
        stream = isAsyncIterable(stream) ? stream : toAsyncIterable(stream);
        types  = typeof types === 'string' ? types.trim().split(/\s*,\s*/) : types;

        try {
            for (const type of types.reverse()) {
                stream = Encoder.create(type).decode(stream);
            }

            return stream;
        }
        catch (err) {
            throw new EncoderError(`'${types}' encoder failed`, err);
        }
    }

    private static encoders = new Map<string, typeof Encoder>();

    private static create(type: string): Encoder {
        const encoder = Encoder.encoders.get(type);

        if (encoder) {
            return new (encoder as any)(type);
        }
        else {
            throw new TypeError(`Encoder '${type}' not found`);
        }
    }

    constructor(protected type: string) {
        this.type = this.type.toLowerCase();
    }

    abstract encode(stream: AsyncIterable<Buffer>): AsyncIterable<Buffer>;
    abstract decode(stream: AsyncIterable<Buffer>): AsyncIterable<Buffer>;
}

export class IdentityEncoder extends Encoder {
    async *encode(stream: AsyncIterable<Buffer>) {
        yield *stream;
    }

    async *decode(stream: AsyncIterable<Buffer>) {
        yield *stream;
    }
}

export class QuotedPrintableEncoder extends Encoder { // See <https://tools.ietf.org/html/rfc2045#section-6.7>
    private static hexEncoded = [...Array(256)].map((_, i) => '=' + (0x100 + i).toString(16).substr(1).toUpperCase());
    private _lineLength = 76;

    async *encode(stream: AsyncIterable<Buffer>) {
        const encodeLine = (line: string, crlf: boolean) => {
            let result = '';
            let offset = 0;

            line = line.replace(/([^\t !-<>-~])/g, (_, c: string) => QuotedPrintableEncoder.hexEncoded[c.charCodeAt(0)]); // Rule #1, #2

            while (offset < line.length) {
                let chars = Math.min(this._lineLength - 1 /* Make room for soft line break */, line.length - offset);

                // Don't break escape sequence
                if (line[offset + chars - 1] === '=') {
                    chars -= 1;
                }
                else if (line[offset + chars - 2] === '=') {
                    chars -= 2;
                }

                const soft = offset + chars < line.length || /[\t ]$/.test(line); // Rule #3, #5

                result += line.substr(offset, chars) + (soft ? '=\r\n' : '');
                offset += chars;
            }

            return result + (crlf ? '\r\n' : '');
        };

        let extra = '';

        for await (const chunk of stream) {
            const lines = (extra + chunk.toString('binary')).split(/\r\n/); // Rule #4
            extra = lines.pop() ?? '';

            yield Buffer.from(lines.map((line) => encodeLine(line, true)).join(''), 'binary');
        }

        if (extra !== '') {
            yield Buffer.from(encodeLine(extra, false), 'binary');
        }
    }

    async *decode(stream: AsyncIterable<Buffer>) {
        const decodeLine = (line: string, crlf: boolean) => {
            line = line.trimEnd(); // Rule #3
            line = line.endsWith('=') ? line.substring(0, line.length - 1) : line + (crlf ? '\r\n' : ''); // Rule #5

            return line.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
                return String.fromCharCode(parseInt(hex, 16)); // Rule #1, #2
            });
        };

        let extra = '';

        for await (const chunk of stream) {
            const lines = (extra + chunk.toString('binary')).split(/\r?\n/); // Rule #4 (but allow single \n as well)
            extra = lines.pop() ?? '';

            yield Buffer.from(lines.map((line) => decodeLine(line, true)).join(''), 'binary');
        }

        if (extra !== '') {
            yield Buffer.from(decodeLine(extra, false), 'binary');
        }
    }
}

export class Base64Encoder extends Encoder {
    private _lineLength = 64; /* Be both PEM- and MIME-compatible */
    private _lineEnding = '\r\n';

    async *encode(stream: AsyncIterable<Buffer>) {
        let length = 0;

        const splitLines = (data: string, final: boolean): Buffer => {
            let result = '';
            let offset = 0;

            while (offset < data.length) {
                const chars = Math.min(this._lineLength - length, data.length - offset);

                result += data.substr(offset, chars);
                offset += chars;
                length += chars;

                if (length === this._lineLength) {
                    length  = 0;
                    result += this._lineEnding;
                }
            }

            if (length !== this._lineLength && final) {
                result += this._lineEnding;
            }

            return Buffer.from(result, 'binary');
        };

        let extra = Buffer.alloc(0);

        for await (const chunk of stream) {
            const buffer = extra.length ? Buffer.concat([extra, chunk]) : chunk;
            const length = buffer.length - buffer.length % 3;
            extra = buffer.slice(length);

            yield splitLines(buffer.slice(0, length).toString('base64'), false);
        }

        if (extra.length) {
            yield splitLines(extra.toString('base64'), true);
        }
    }

    async *decode(stream: AsyncIterable<Buffer>) {
        let extra = '';

        for await (const chunk of stream) {
            const base64 = extra + chunk.toString('binary').replace(/[^0-9A-Za-z+/_-]/g, '');
            const length = base64.length - base64.length % 4;
            extra = base64.substring(length);

            yield Buffer.from(base64.substring(0, length), 'base64');
        }

        if (extra.length) {
            yield Buffer.from(extra, 'base64');
        }
    }
}

export class ZlibEncoder extends Encoder {
    encode(stream: AsyncIterable<Buffer>) {
        switch (this.type) {
            case 'br':      return this._transform(stream, createBrotliCompress());
            case 'gzip':    return this._transform(stream, createGzip());
            case 'x-gzip':  return this._transform(stream, createGzip());
            case 'deflate': return this._transform(stream, createDeflate());
            default:        throw new TypeError(`Unsupported compression type '${this.type}'`);
        }
    }

    decode(stream: AsyncIterable<Buffer>) {
        switch (this.type) {
            case 'br':      return this._transform(stream, createBrotliDecompress());
            case 'gzip':    return this._transform(stream, createGunzip());
            case 'x-gzip':  return this._transform(stream, createGunzip());
            case 'deflate': return this._transform(stream, createInflate());
            default:        throw new TypeError(`Unsupported compression type '${this.type}'`);
        }
    }

    private async *_transform(stream: AsyncIterable<Buffer>, transform: Transform) {
        yield* toReadableStream(stream).pipe(transform);
    }
}

Encoder
    .register('7bit',             IdentityEncoder)
    .register('8bit',             IdentityEncoder)
    .register('base64',           Base64Encoder)
    .register('base64url',        Base64Encoder)
    .register('binary',           IdentityEncoder)
    .register('br',               ZlibEncoder)
    .register('deflate',          ZlibEncoder)
    .register('gzip',             ZlibEncoder)
    .register('identity',         IdentityEncoder)
    .register('quoted-printable', QuotedPrintableEncoder)
    .register('x-gzip',           ZlibEncoder)
;
