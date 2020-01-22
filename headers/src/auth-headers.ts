export interface AuthHeaderParams {
    [name: string]: { value: string, quoted?: boolean } | undefined;
}

// Like RFC 7235, but very forgiving
const AUTH_SCHEME  = /\s*(?<scheme>[^,\s]+)/;
const AUTH_PARAM   = /\s*(?<param>[^=\s]+)\s*=\s*(?:"(?<qvalue>(?:\\(?:\\\\)*"|[^"])*)"|(?<value>[^=,\s]+))\s*,?/;
const AUTH_TOKEN68 = /\s*(?<token68>[-._~+/a-zA-Z0-9]+=*)\s*,?/;
const AUTH_HEADER  = RegExp(`${AUTH_SCHEME.source}(?:(?<params>(?:${AUTH_PARAM.source})+)|${AUTH_TOKEN68.source})?`);

export abstract class AuthHeader {
    static split(unparsed: string): string[] {
        const result: string[] = [];

        for (let pattern = new RegExp(AUTH_HEADER, 'g'), match = pattern.exec(unparsed); match; match = pattern.exec(unparsed)) {
            result.push(match[0].trim());
        }

        return result;
    }

    scheme!: string;
    credentials?: string;
    params?: AuthHeaderParams;

    protected constructor(public unparsed: string, public name: string) {
        const parsed = AUTH_HEADER.exec(unparsed);
        const groups = parsed?.groups!;
        const scheme = groups?.scheme?.toLowerCase();

        if (!scheme) {
            throw new TypeError(`Failed to parse AuthHeader '${unparsed}': Invalid format`);
        }

        this.scheme      = scheme!;
        this.credentials = groups.token68;

        if (groups.params) {
            this.params = {};

            for (let pattern = new RegExp(AUTH_PARAM, 'g'), match = pattern.exec(groups.params); match; match = pattern.exec(groups.params)) {
                const groups = match.groups!;
                const quoted = groups.qvalue !== undefined;

                this.params[groups.param] = { value: quoted ? groups.qvalue.replace(/\\(.)/g, '$1') : groups.value, quoted };
            }
        }
    }

    param(name: string): string | undefined;
    param(name: string, fallback: string): string;
    param(name: string, fallback?: string): string | undefined {
        return this.params?.[name]?.value ?? fallback;
    }

    setParam(name: string, value: string | number | undefined, quoted?: boolean): this {
        this.params = this.params ?? {};

        if (value !== undefined) {
            this.params[name] = { value: String(value), quoted };
        }
        else {
            delete this.params[name];
        }

        return this;
    }

    get realm(): string | undefined {
        return this.param('realm');
    }

    toString() {
        return `${this.scheme} ${this.credentials ?? this.formatParams()}`;
    }

    isProxyHeader(): boolean {
        return this.name.startsWith('proxy-');
    }

    protected formatParams() {
        return Object.entries(this.params ?? {})
            .map(([param, info]) => info!.quoted ?? (!/^[-!#$%&'*+.0-9=A-Z^_`a-z|~]+$/.test(info!.value) || param === 'realm' /* [sic!] */)
                ? `${param}="${info!.value.replace(/([\\"])/g, '\\$1')}"`
                : `${param}=${info!.value}`)
            .join(', ');
    }

}

export class Authorization extends AuthHeader {
    public constructor(unparsed: string, proxy = false) {
        super(unparsed, proxy ? 'proxy-authorization' : 'authorization');
    }
}

export class AuthenticationInfo extends AuthHeader {
    public constructor(unparsed: string, proxy = false) {
        super(unparsed, proxy ? 'proxy-authentication-info' : 'authorization-info');
    }
}

export class ServerAuthorization extends AuthHeader {
    public constructor(unparsed: string, proxy = false) {
        super(unparsed, proxy ? 'proxy-server-authorization' : 'server-authorization');
    }
}

export class WWWAuthenticate extends AuthHeader {
    static create(unparsed: string): WWWAuthenticate[] {
        return AuthHeader.split(unparsed).map((header) => new WWWAuthenticate(header));
    }

    public constructor(unparsed: string, proxy = false) {
        super(unparsed, proxy ? 'proxy-authenticate' : 'www-authenticate');
    }
}
