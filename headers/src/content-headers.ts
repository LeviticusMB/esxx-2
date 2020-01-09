export interface ContentHeaderParams {
    [name: string]: string | undefined;
}

export class ContentHeader {
    type: string;
    params: ContentHeaderParams = {};

    constructor(public unparsed: string, public name?: string) {
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

    param(name: string): string | undefined;
    param(name: string, fallback: string): string;
    param(name: string, fallback?: string): string | undefined {
        return this.params[name] !== undefined ? this.params[name] : fallback;
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
        return this.valueOf();
    }

    valueOf(): string {
        let params = '';

        for (let [name, value] of Object.entries(this.params)) {
            const safe = value!.replace(/[^\u0020-\u007e\u00a1-\u00ff]/g, '_');

            if (safe !== value) {
                value = `utf-8''${encodeURI(value!)}`;

                params += `;${name}*="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
            }

            params += `;${name}="${safe.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        }

        return this.type + params;
    }
}

export class ContentDisposition extends ContentHeader {
    static readonly attachment = new ContentDisposition('attachment');
    static readonly inline     = new ContentDisposition('inline');

    static create(cd: string | ContentDisposition | null | undefined, fallback?: string | ContentDisposition | null): ContentDisposition {
        if (typeof cd === 'string') {
            cd = new ContentDisposition(cd);
        }

        return cd ?? ContentDisposition.create(fallback, ContentDisposition.inline);
    }

    constructor(unparsed: string, filename?: string) {
        super(unparsed, 'content-disposition');

        this.setParam('filename', filename);
    }

    get filename() {
        return this.param('filename');
    }
}

export class ContentType extends ContentHeader {
    static readonly bytes = new ContentType('application/octet-stream');
    static readonly dir   = new ContentType('application/vnd.esxx.directory+json');
    static readonly csv   = new ContentType('text/csv');
    static readonly json  = new ContentType('application/json');
    static readonly text  = new ContentType('text/plain');
    static readonly xml   = new ContentType('application/xml');

    static create(ct: string | ContentType | null | undefined, fallback?: string | ContentType | null): ContentType {
        if (typeof ct === 'string') {
            ct = new ContentType(ct);
        }

        return ct ?? ContentType.create(fallback, ContentType.bytes);
    }

    constructor(unparsed: string, charset?: string) {
        super(unparsed, 'content-type');

        this.setParam('charset', charset);
    }

    get charset() {
        return this.param('charset');
    }
}
