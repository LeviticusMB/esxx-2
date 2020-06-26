// tslint:disable-next-line: no-implicit-dependencies
import { Expect, Test, TestCase } from 'alsatian';
import { randomBytes } from 'crypto';
import { Encoder } from '../src';

async function* randomChunkSize(source: Buffer) {
    for (let offset = 0; offset < source.length;) {
        const length = Math.min(source.length - offset, Math.round(Math.random() * 1024));

        yield source.slice(offset, offset + length);

        offset += length;
    }
}

async function join(stream: AsyncIterable<Buffer>): Promise<Buffer> {
    const buffers = [];

    for await (const chunk of stream) {
        buffers.push(chunk);
    }

    return Buffer.concat(buffers);
}

export class EncodingTest {
    @TestCase('7bit')
    @TestCase('8bit')
    @TestCase('base64')
    @TestCase('base64url')
    @TestCase('binary')
    @TestCase('br')
    @TestCase('deflate')
    @TestCase('gzip')
    @TestCase('identity')
    @TestCase('quoted-printable')
    @TestCase('x-gzip')
    async binaryIdentity(encoding: string) {
        const data = randomBytes(Math.round(Math.random() * 8192));
        const result = await join(Encoder.decode(encoding, Encoder.encode(encoding, randomChunkSize(data))));

        Expect(result).toEqual(data);
    }

    @TestCase('7bit')
    @TestCase('8bit')
    @TestCase('base64')
    @TestCase('base64url')
    @TestCase('binary')
    @TestCase('br')
    @TestCase('deflate')
    @TestCase('gzip')
    @TestCase('identity')
    @TestCase('quoted-printable')
    @TestCase('x-gzip')
    async textIdentity(encoding: string) {
        const data = Buffer.from(randomBytes(Math.round(Math.random() * 8192)).toString('base64').replace(/\//g, '\r\n').replace(/\+/g, ' '));
        const result = await join(Encoder.decode(encoding, Encoder.encode(encoding, randomChunkSize(data))));

        Expect(result).toEqual(data);
    }

    @Test() async qpTest() {
        const qp = 'quoted-printable';

        Expect(await join(Encoder.encode(qp, ''))).toEqual(Buffer.from(''));
        Expect(await join(Encoder.encode(qp, '\n'))).toEqual(Buffer.from('=0A'));
        Expect(await join(Encoder.encode(qp, '\r'))).toEqual(Buffer.from('=0D'));
        Expect(await join(Encoder.encode(qp, '\r\n'))).toEqual(Buffer.from('\r\n'));

        Expect(await join(Encoder.decode(qp, ''))).toEqual(Buffer.from(''));
        Expect(await join(Encoder.decode(qp, '=0A'))).toEqual(Buffer.from('\n'));
        Expect(await join(Encoder.decode(qp, '=0D'))).toEqual(Buffer.from('\r'));
        Expect(await join(Encoder.decode(qp, '\r\n'))).toEqual(Buffer.from('\r\n'));
    }
}
