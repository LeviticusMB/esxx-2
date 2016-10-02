
exports.kvWrapper = function kvWrapper(wrapped) {
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

exports.es6Encoder = function es6Encoder(strings, values, encoder) {
    let result = strings[0];

    for (let i = 0; i < values.length; ++i) {
        result += encoder(values[i]) + strings[i + 1];
    }

    return result;
}

exports.esxxEncoder = function esxxEncoder(template, params, encoder) {
    return template.replace(/(^|[^\\])(\\\\)*{([^{} \f\n\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+)}/g, (match) => {
        let start = match.lastIndexOf('{');
        let value = params[match.substring(start + 1, match.length - 1)];

        return match.substring(0, start) + (value !== undefined ? encoder(value) : '');
    });
}
