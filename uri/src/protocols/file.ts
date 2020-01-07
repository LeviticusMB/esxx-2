import { ContentType } from '@divine/headers';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { lookup } from 'mime-types';
import { basename } from 'path';
import { Parser } from '../parsers';
import { DirectoryEntry, URI, URIException } from '../uri';
import { copyStream, IteratorStream } from '../utils';

export class FileProtocol extends URI {
    private _path: string;

    constructor(uri: URI) {
        super(uri);

        if ((this.hostname !== '' && this.hostname !== 'localhost') || this.port !== '' || this.search !== '' || this.hash !== '') {
            throw new URIException(`URI ${this}: Host/port/query/fragment parts not allowed`);
        }
        else if (/%2F/i.test(this.pathname) /* No encoded slashes */) {
            throw new URIException(`URI ${this}: Path invalid`);
        }

        this._path = decodeURIComponent(this.pathname);
    }

    async info(): Promise<DirectoryEntry> {
        const stats = await fs.stat(this._path);
        const ct = stats.isDirectory() ? ContentType.dir : ContentType.create(lookup(this._path) || undefined);

        return {
            uri:     this.toString(),
            name:    basename(this._path),
            type:    ct.type,
            length:  stats.size,
            created: stats.birthtime,
            updated: stats.mtime,
        };
    }

    async list(): Promise<DirectoryEntry[]> {
        const children = await fs.readdir(this._path);

        return Promise.all(children.map((child) => this.resolvePath(child).info()));
    }

    async load(recvCT?: ContentType | string): Promise<object> {
        const stream = createReadStream(this._path, { flags: 'r', encoding: undefined });

        return Parser.parse(ContentType.create(recvCT, lookup(this._path) || undefined), stream);
    }

    async save(data: any, sendCT?: ContentType | string, recvCT?: ContentType): Promise<object> {
        if (recvCT !== undefined) {
            throw new URIException(`URI ${this}: save: recvCT argument is not supported`);
        }

        await this._write(data, sendCT, false);
        return Object(URI.void);
    }

    async append(data: any, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<object> {
        if (recvCT !== undefined) {
            throw new URIException(`URI ${this}: append: recvCT argument is not supported`);
        }

        await this._write(data, sendCT, true);
        return Object(URI.void);
    }

    // async modify(data: any, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<object> {
    // }

    async remove(_recvCT?: ContentType | string): Promise<object> {
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

        return Object(rc);
    }

    private async _write(data: any, sendCT: ContentType | string | undefined, append: boolean): Promise<void> {
        const [/* contentType */, serialized] = await Parser.serialize(sendCT, data);

        await copyStream(new IteratorStream(serialized),
                         createWriteStream(this._path, { flags: append ? 'a' : 'w', encoding: undefined }));
    }
}
