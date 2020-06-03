import { Parser, StringParser } from '../parsers';

export class JSONParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<boolean | number | null | string | object> {
        return JSON.parse(await new StringParser(this.contentType).parse(stream));
    }

    serialize(data: unknown): Buffer {
        try {
            data = JSON.stringify(data);
        }
        catch (ex) {
            this.assertSerializebleData(false, data, ex);
        }

        return new StringParser(this.contentType).serialize(data);
    }
}

Parser.register('application/json', JSONParser);
