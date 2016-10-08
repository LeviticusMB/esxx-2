
export type ValueEncoder = (this: void, value: string) => string;

export interface Params {
    [key: string] : Object | string | number | boolean | null | undefined;
}

export function kvWrapper(wrapped : any) : Params {
    return new Proxy(wrapped, {
        has: (target, prop) => {
            console.log(`kvWrapper.has ${prop} => ${target[prop] !== undefined}`);
            return target[prop] !== undefined;
        },

        get: (target, prop) => {
            console.log(`kvWrapper.get ${prop} => ${target[prop]}`);
            return target[prop];
        },
    });
}

export function es6Encoder(strings: TemplateStringsArray, values: any[], encoder: ValueEncoder) {
    let result = strings[0];

    for (let i = 0; i < values.length; ++i) {
        result += encoder(String(values[i])) + strings[i + 1];
    }

    return result;
}

export function esxxEncoder(template: string, params: Params, encoder: ValueEncoder) {
    return template.replace(/(^|[^\\])(\\\\)*{([^{} \f\n\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+)}/g, (match) => {
        let start = match.lastIndexOf('{');
        let value = params[match.substring(start + 1, match.length - 1)];

        return match.substring(0, start) + (value !== undefined ? encoder(String(value)) : '');
    });
}
