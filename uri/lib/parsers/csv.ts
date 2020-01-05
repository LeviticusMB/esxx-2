
import * as Papa from 'papaparse';
import { ObjectOrPrimitive, Parser } from '../parsers';
import { URIException } from '../uri';
import { IteratorStream } from '../utils';

// See https://tools.ietf.org/html/rfc4180

export class CSVParser extends Parser {
    parse(stream: AsyncIterable<Buffer>): Promise<string[][] | object[]> {
        return new Promise((resolve, reject) => {
            const charset   = this.contentType.param('charset',     'utf8');
            const header    = this.contentType.param('header',      'absent');
            const eol       = this.contentType.param('x-eol',       '');
            const separator = this.contentType.param('x-separator', '');
            const quote     = this.contentType.param('x-quote',     '"');

            Papa.parse(new IteratorStream(stream) as any as File, {
                encoding:  charset, // TODO: Encoding
                header:    header === 'present',
                newline:   eol,
                delimiter: separator,
                quoteChar: quote,

                beforeFirstChunk: (chunk) => {
                    return chunk.charCodeAt(0) === 0xFEFF /* BOM */ ? chunk.substr(1) : undefined;
                },

                error: (error) => {
                    reject(new URIException(error.message, undefined, error));
                },

                complete: (result) => {
                    resolve(result.data);
                }
            });
        });
    }

    async *serialize(data: string[][] | object[]): AsyncIterableIterator<Buffer> {
        this.assertSerializebleData(Array.isArray(data), data);

        const charset   = this.contentType.param('charset',     'utf8');
        const header    = this.contentType.param('header',      'absent');
        const eol       = this.contentType.param('x-eol',       '\r\n');
        const separator = this.contentType.param('x-separator', this.contentType.baseType() === 'text/csv' ? ',' : '\t');
        const quote     = this.contentType.param('x-quote',     '"');
        const escape    = this.contentType.param('x-escape',    quote);

        const search    = quote === '' ? separator : quote;
        const replace   = escape + search;
        let   fields    = null;

        function convertRow(row: Iterable<ObjectOrPrimitive>): Buffer {
            const line: string[] = [];

            for (const column of row as Iterable<ObjectOrPrimitive>) {
                line.push(column === null || column === undefined ? '' : quote + column.toString().replace(search, replace) + quote);
            }

            return Buffer.from(line.join(separator) + eol, charset); // TODO: Encoding
        }

        for (let row of data) {
            this.assertSerializebleData(Array.isArray(row) || typeof row === 'object', row);

            if (!Array.isArray(row)) {
                if (!fields) {
                    fields = Object.keys(row);

                    if (header === 'present') {
                        yield convertRow(fields);
                    }
                }

                row = fields.map((key) => (row as any)[key]);
            }

            yield convertRow(row as Iterable<ObjectOrPrimitive>);
        }
    }
}
