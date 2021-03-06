import TOML from '@iarna/toml';
import { Parser, StringParser } from '../parsers';

export class TOMLParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<TOML.JsonMap> {
        return TOML.parse(await new StringParser(this.contentType).parse(stream));
    }

    serialize(data: unknown): Buffer {
        this.assertSerializebleData(data !== null && data !== undefined && !(data instanceof Date), data);

        try {
            if (typeof data === 'object' && !Array.isArray(data)) {
                data = TOML.stringify(data as TOML.JsonMap);
            }
            else {
                data = TOML.stringify.value(data as TOML.AnyJson);
            }
        }
        catch (ex) {
            this.assertSerializebleData(false, data, ex);
        }

        return new StringParser(this.contentType).serialize(data);
    }
}

Parser.register('application/toml', TOMLParser);
