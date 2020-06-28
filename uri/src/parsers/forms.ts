import { ContentDisposition, ContentType, KVPairs } from '@divine/headers';
import { randomBytes } from 'crypto';
import Dicer from 'dicer';
import { PassThrough, Readable } from 'stream';
import { URLSearchParams } from 'url';
import { Encoder } from '../encoders';
import { Parser, StringParser } from '../parsers';
import { CacheURI } from '../protocols/cache';
import { FIELDS, Finalizable, FINALIZE, URI, WithFields } from '../uri';
import { copyStream } from '../utils';

export interface FormData extends WithFields<FormField> {
    [key: string]: string | undefined;
}

export interface MultiPartData extends WithFields<MultiPartField>, Finalizable {
    [key: string]: any;
}

export interface FormField {
    name:        string;
    value:       string;
}

export interface MultiPartField {
    name?:        string;
    type:         ContentType;
    headers:      KVPairs;
    body:         any;
}

async function* wrapMessage(boundary: string, message: AsyncIterable<Buffer>): AsyncIterable<Buffer> {
    yield Buffer.from(`--${boundary}\r\n`);
    yield* message;
    yield Buffer.from(`\r\n--${boundary}--\r\n`);
}

export class FormParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<FormData> {
        const params = new URLSearchParams(await new StringParser(this.contentType).parse(stream));
        const result: FormData = {
            [FIELDS]: [...params.entries()].map(([name, value]) => ({ name, value }))
        };

        for (const [name, value] of params.entries()) {
            result[name] = result[name] === undefined ? value : `${result[name]}, ${value}`;
        }

        return result;
    }

    serialize(data: Partial<FormData>): Buffer {
        this.assertSerializebleData(typeof data === 'object' || Array.isArray(data?.[FIELDS]), data);

        const entries = data[FIELDS]?.map((f) => [f.name, f.value] as [string, string]) ?? data;
        return new StringParser(this.contentType).serialize(new URLSearchParams(entries));
    }
}

function squashMultiPartData(data: MultiPartData | MultiPartData[]): any {
    if (Array.isArray(data)) {
        return data.map((entry) => squashMultiPartData(entry));
    }
    else if (data?.[FIELDS]) {
        return data[FIELDS]!.map((field) => {
            return { ...field, body: squashMultiPartData(field.body /* any! */) };
        });
    }
    else {
        return data;
    }
}

export class MessageParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<MultiPartField> {
        const boundary = '---=__' + randomBytes(48).toString('base64');
        const formType = new ContentType('multipart/*').setParam('boundary', boundary);

        return squashMultiPartData(await new MultiPartParser(formType).parse(wrapMessage(boundary, stream)))[0];
    }

    serialize(data: unknown): Buffer {
        throw new Error('MessageParser.serialize not implemented');
    }
}

interface DicerHeaders {
    [key: string]: string[] | undefined;
}

export class MultiPartParser extends Parser {
    static defaultContentType = ContentType.text;

    async parse(stream: AsyncIterable<Buffer>): Promise<MultiPartData> {
        const boundary = this.contentType.param('boundary');
        const values: Array<Promise<MultiPartField>> = [];
        const caches: URI[] = [];

        const saveToCache = async (type: ContentType, stream: AsyncIterable<Buffer>) => {
            const uri = CacheURI.create(type);

            caches.push(uri);
            await uri.save(stream, ContentType.bytes);

            return uri;
        };

        await copyStream(Readable.from(stream), new Dicer({ boundary })
            .on('part', (part) => {
                let partFailed = true;

                const stream = part.on('header', (_headers: DicerHeaders) => {
                    partFailed = false;

                    // eslint-disable-next-line no-async-promise-executor
                    values.push(new Promise(async (resolve, reject) => {
                        try {
                            const headers: KVPairs = Object.fromEntries(Object.entries(_headers).map(([k, v]) => [k, v?.join(', ')]));
                            const type             = ContentType.create(headers['content-type'], MultiPartParser.defaultContentType);
                            const disposition      = headers['content-disposition'] && new ContentDisposition(headers['content-disposition']) || undefined;
                            const name             = disposition?.param('name');
                            const parsed           = disposition?.type === 'form-data' && disposition?.filename === undefined ||
                                                     disposition?.type !== 'form-data' && (type.baseType === 'multipart' || type.type === 'text/plain');
                            let body: object;
                            const data: AsyncIterable<Buffer> = Encoder.decode(headers['content-transfer-encoding'] ?? [], stream);

                            if (parsed) {
                                body = (await Parser.parse(type, data)).valueOf();
                            }
                            else {
                                body = await saveToCache(type, data);
                            }

                            resolve({ name, type, headers, body });
                        }
                        catch (err) {
                            reject(err);
                        }
                    }));
                })
                .on('end', () => {
                    if (partFailed) {
                        values.push(Promise.reject(new Error(`Missing headers`)));
                    }
                })
                .pipe(new PassThrough());
            })
        );

        const result: MultiPartData = {
            [FIELDS]:   await Promise.all(values),
            [FINALIZE]: async () => {
                for (const uri of caches) {
                    await uri.remove().catch(() => { /* Ignore */ });
                }
            }
        };

        for (const field of result[FIELDS]!) {
            if (field.name !== undefined) {
                result[field.name] = result[field.name] ?? field.body;
            }
        }

        return result;
    }

    serialize(data: unknown): Buffer {
        throw new Error('MultiPartParser.serialize not implemented');
    }
}

Parser
    .register('application/x-www-form-urlencoded', FormParser)
    .register('message/*',                         MessageParser)
    .register('multipart/*',                       MultiPartParser)
;
