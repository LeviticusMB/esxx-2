import { Expect, Test } from 'alsatian';
import { AuthHeader, Authorization, WWWAuthenticate } from '../src';

export class AuthSchemeTest {
    @Test() basic() {
        const auth = new Authorization('Basic Zm9vOmJhcjpubw==');

        Expect(auth instanceof AuthHeader).toBeTruthy();
        Expect(auth.headerName).toBe('authorization');
        Expect(auth.scheme).toBe('basic');
        Expect(auth.credentials).toBe('Zm9vOmJhcjpubw==');
    }

    @Test() params() {
        const auths = WWWAuthenticate.create('Params a=A,b="B",  c   =  " C " ,d=",D" e="\\"E\\\\\\"\\\\" ,');
        const auth = auths[0];

        Expect(auths.length).toBe(1);
        Expect(auth instanceof AuthHeader).toBeTruthy();
        Expect(auth.scheme).toBe('params');
        Expect(auth.param('a')).toBe('A');
        Expect(auth.param('b')).toBe('B');
        Expect(auth.param('c')).toBe(' C ');
        Expect(auth.param('d')).toBe(',D');
        Expect(auth.param('e')).toBe('"E\\"\\');
    }
}
