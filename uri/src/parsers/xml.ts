import { DOMParser, XMLSerializer } from 'xmldom';
import { Parser, StringParser } from '../parsers';
import { isDOMNode } from '../utils';

export class XMLParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<Document> {
        return new DOMParser().parseFromString(await new StringParser(this.contentType).parse(stream));
    }

    serialize(data: unknown): Buffer {
        this.assertSerializebleData(isDOMNode(data), data);

        return new StringParser(this.contentType).serialize(new XMLSerializer().serializeToString(data as Node));
    }
}

Parser.register('application/xml', XMLParser)
      .register('text/xml',        XMLParser)
;
