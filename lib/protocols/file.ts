import { Parser } from '../parsers';
import { ContentType, DirectoryEntry, URI, URIException } from '../uri';
import { toObservable, toReadableStream } from '../utils';

import * as mime from 'mime-types';
import * as fs   from 'mz/fs';
import * as path from 'path';

export class FileProtocol extends URI {
    private _path: string;

    constructor(uri: URI) {
        super(uri);

        if ((this.uriHost !== undefined && this.uriHost !== '' && this.uriHost !== 'localhost') ||
            this.uriPort !== undefined || this.uriQuery !== undefined || this.uriFragment !== undefined) {
            throw new URIException(`URI ${this}: Host/port/query/fragment parts not allowed`);
        }
        else if (typeof this.uriPath !== 'string' || /%2F/i.test(this.uriPath) /* No encoded slashes */) {
            throw new URIException(`URI ${this}: Path missing/invalid`);
        }

        this._path = decodeURIComponent(this.uriPath);
    }

    async info(): Promise<DirectoryEntry> {
        const stats = await fs.stat(this._path);
        const ct = stats.isDirectory() ? ContentType.dir : ContentType.create(mime.lookup(this._path) || undefined);

        return {
            uri:     this.valueOf(),
            name:    path.basename(this._path),
            type:    ct.baseType(),
            length:  stats.size,
            created: stats.birthtime,
            updated: stats.mtime,
        };
    }

    async list(): Promise<DirectoryEntry[]> {
        const children = await fs.readdir(this._path);

        return await Promise.all(children.map((child) => this.resolvePath(child).info()));
    }

    async load(recvCT?: ContentType | string): Promise<Object> {
        const stream = fs.createReadStream(this._path, { flags: 'r', encoding: undefined });

        return await Parser.parse(ContentType.create(recvCT, mime.lookup(this._path) || undefined),
                                  toObservable('utf8' /* Unused */, stream));
    }

    async save(data: any, sendCT?: ContentType | string, recvCT?: ContentType): Promise<void> {
        if (recvCT !== undefined) {
            throw new URIException(`URI ${this}: save: recvCT argument is not supported`);
        }

        return this._write(data, sendCT, false);
    }

    async append(data: any, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<void> {
        if (recvCT !== undefined) {
            throw new URIException(`URI ${this}: append: recvCT argument is not supported`);
        }

        return this._write(data, sendCT, true);
    }

    // async modify(data: any, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<void> {
    // }

    async remove(_recvCT?: ContentType | string): Promise<boolean> {
        let rc = false;

        try {
            if ((await fs.stat(this._path)).isDirectory()) {
                await fs.rmdir(this._path);
            }
            else {
                await fs.unlink(this._path);
            }

            rc = true;
        }
        catch (err) {
            if (err.code !== 'ENOENT') {
                throw err;
            }
        }

        return rc;
    }

    private async _write(data: any, sendCT: ContentType | string | undefined, append: boolean): Promise<void> {
        const [/* contentType */, serialized] = await Parser.serialize(sendCT, data);

        await new Promise((resolve, reject) => {
            toReadableStream(serialized)
                .pipe(fs.createWriteStream(this._path, { flags: append ? 'a' : 'w', encoding: undefined }))
                .on('finish', resolve)
                .on('error', reject);
        });
    }
}
