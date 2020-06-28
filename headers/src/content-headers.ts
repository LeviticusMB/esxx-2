import { KVPairs } from './common';

export class ContentHeader {
    readonly type: string;
    readonly params: KVPairs = {};

    constructor(unparsed: string | ContentHeader, public readonly headerName?: string) {
        if (unparsed instanceof ContentHeader) {
            this.type   = unparsed.type;
            this.params = JSON.parse(JSON.stringify(unparsed.params));
            return;
        }

        const [, type, params] = /\s*([^\s;]*)\s*(.*)/.exec(unparsed)!;

        this.type = type;

        for (let pr = /;\s*([^\s=]*)\s*=\s*(?:([^";]+)|"((?:[^"\\]|\\.)*)")[^;]*/g, param = pr.exec(params); param; param = pr.exec(params)) {
            let name  = param[1].toLowerCase();
            let value = param[2] !== undefined ? param[2] : param[3].replace(/\\(.)/g, '$1');

            if (name.endsWith('*')) {
                const [, charset, /* language */, encoded] = /^([^']*)'([^']*)'(.*)/.exec(value) || ['', '', '', ''];

                try {
                    if (charset.toLowerCase() === 'utf-8') {
                        value = decodeURIComponent(encoded);
                    }
                    else {
                        value = unescape(encoded); // Assume Latin 1
                    }
                }
                catch (ex) {
                    value = unescape(encoded); // Just try Latin 1 then
                }

                name = name.substr(0, name.length - 1);
                delete this.params[name];
            }

            if (this.params[name] === undefined) {
                this.params[name] = value;
            }
        }
    }

    get baseType(): string {
        return this.type.split('/')[0];
    }

    param(name: string): string | undefined;
    param(name: string, fallback: string): string;
    param(name: string, fallback?: string): string | undefined {
        return this.params[name] ?? fallback;
    }

    setParam(name: string, value: string | number | undefined): this {
        if (value !== undefined) {
            this.params[name] = String(value);
        }
        else {
            delete this.params[name];
        }

        return this;
    }

    toString(): string {
        let params = '';

        for (const [name, value] of Object.entries(this.params)) {
            const safe = value!.replace(/[^\u0020-\u007e\u00a1-\u00ff]/g, '_');

            if (safe !== value) {
                const unsafe = `utf-8''${encodeURI(value!)}`;

                params += `;${name}*="${unsafe.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
            }

            params += `;${name}="${safe.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        }

        return this.type + params;
    }

    valueOf(): string {
        return this.toString();
    }
}

export class ContentDisposition extends ContentHeader {
    static get attachment() { return new ContentDisposition('attachment'); }
    static get inline()     { return new ContentDisposition('inline');     }
    static get formData()   { return new ContentDisposition('form-data');  }

    static create(cd: string | ContentDisposition | null | undefined, fallback?: string | ContentDisposition | null): ContentDisposition {
        if (typeof cd === 'string' || cd instanceof ContentDisposition) {
            cd = new ContentDisposition(cd);
        }

        return cd ?? ContentDisposition.create(fallback, ContentDisposition.inline);
    }

    constructor(unparsed: string | ContentDisposition, filename?: string) {
        super(unparsed, 'content-disposition');

        if (filename !== undefined) {
            this.setParam('filename', filename);
        }
    }

    get filename(): string | undefined {
        return this.param('filename');
    }
}

export class ContentType extends ContentHeader {
    static get bytes()      { return new ContentType('application/octet-stream');            }
    static get csv()        { return new ContentType('text/csv');                            }
    static get dir()        { return new ContentType('application/vnd.esxx.directory+json'); }
    static get formData()   { return new ContentType('multipart/form-data');                 }
    static get html()       { return new ContentType('text/html');                           }
    static get json()       { return new ContentType('application/json');                    }
    static get text()       { return new ContentType('text/plain');                          }
    static get urlencoded() { return new ContentType('application/x-www-form-urlencoded');   }
    static get xml()        { return new ContentType('application/xml');                     }

    static create(ct: string | ContentType | null | undefined, fallback?: string | ContentType | null): ContentType {
        if (typeof ct === 'string' || ct instanceof ContentType) {
            ct = new ContentType(ct);
        }

        return ct ?? ContentType.create(fallback, ContentType.bytes);
    }

    constructor(unparsed: string | ContentType, charset?: string) {
        super(unparsed, 'content-type');

        if (charset !== undefined) {
            this.setParam('charset', charset);
        }
    }

    get charset(): string | undefined {
        return this.param('charset');
    }
}
