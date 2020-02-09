import { Expect, Test } from 'alsatian';
import { AuthHeader, Authorization, WWWAuthenticate } from '../src';

export class AuthSchemeTest {
    @Test() basic() {
        const auth = new Authorization('Basic Zm9vOmJhcjpubw==');

        Expect(auth instanceof AuthHeader).toBeTruthy();
        Expect(auth.headerName).toEqual('authorization');
        Expect(auth.scheme).toEqual('basic');
        Expect(auth.credentials).toEqual('Zm9vOmJhcjpubw==');
    }

    @Test() params() {
        const auth = new WWWAuthenticate('Params a=A,b="B",  c   =  " C " ,d=",D" e="\\"E\\\\\\"\\\\" ,');

        Expect(auth instanceof AuthHeader).toBeTruthy();
        Expect(auth.scheme).toEqual('params');
        Expect(auth.param('a')).toEqual('A');
        Expect(auth.param('b')).toEqual('B');
        Expect(auth.param('c')).toEqual(' C ');
        Expect(auth.param('d')).toEqual(',D');
        Expect(auth.param('e')).toEqual('"E\\"\\');
    }
}
