// tslint:disable-next-line: no-implicit-dependencies
import { Expect, Test } from 'alsatian';
import { IncomingMessage } from 'http';
import { WebRequest, WebResponse, WebService, WebStatus } from '../src';

function fakedReq(method: string, url: string, _payload?: object) {
    // tslint:disable-next-line: no-object-literal-type-assertion
    return new WebRequest({
        method, url,
        headers: {
            host: 'localhost',
        },
        socket: {
            remoteAddress: 'remote:9999',
        },
    } as IncomingMessage, {
        console,
        trustForwardedFor:   false,
        trustForwardedHost:  false,
        trustForwardedProto: false,
        trustMethodOverride: false,
    });
}

export class WebServiceTest {
    @Test() async dispatch() {
        const ws = new WebService('context')
            .addResource(class {
                static path = /default/;

                constructor(req: WebRequest, context: any) {
                    Expect(req.url.href).toEqual('http://localhost/default?foo');
                    Expect(context).toEqual('context');
                }

                async default(req: WebRequest) {
                    return `default ${req.method}`;
                }
            })
            .addResource(class {
                static path = /options/;

                async OPTIONS(req: WebRequest) {
                    Expect(req.method).toEqual('OPTIONS');
                    return `options ${req.method}`;
                }
            })
            .addResource(class {
                static path = /other/;

                async GET() {
                    return null;
                }
            });

        const r1 = await ws.dispatchRequest(fakedReq('X-SPECIAL', '/default?foo'));
        Expect(r1.status).toEqual(WebStatus.OK);
        Expect(r1.body!.toString()).toEqual('default X-SPECIAL');

        const r2 = await ws.dispatchRequest(fakedReq('OPTIONS', '/options'));
        Expect(r2.status).toEqual(WebStatus.OK);
        Expect(r2.body!.toString()).toEqual('options OPTIONS');

        const r3 = await ws.dispatchRequest(fakedReq('OPTIONS', '/other'));
        Expect(r3.status).toEqual(WebStatus.OK);
        Expect(r3.body).toEqual(null);
        Expect(r3.headers.allow).toEqual(['GET', 'HEAD', 'OPTIONS']);

        await Expect(() => ws.dispatchRequest(fakedReq('POST', '/options'))).toThrowAsync();
    }

    @Test() async responses() {
        const ws = new WebService('context')
            .addResource(class {
                static path = /GET\/(?<id>\d)/;
                private digit: number;

                constructor(req: WebRequest) {
                    Expect(req.string('1') === req.string('id')).toBe(true);
                    this.digit = req.number('1');
                }

                async GET(_req: WebRequest) {
                    switch (this.digit) {
                        case 0: return null;
                        case 1: return '1';
                        case 2: return [2];
                        case 3: return { value: 3 };
                        case 4: return new WebResponse(WebStatus.ACCEPTED, null);
                        case 5: return new WebResponse(WebStatus.ACCEPTED, 'five', { etag: 'V'}).customHeader('Custom-Header', 'v');
                        default: return 'default';
                    }
                }
            });

        const r0a = await ws.dispatchRequest(fakedReq('GET', '/GET/0'));
        Expect(r0a.status).toEqual(WebStatus.NO_CONTENT);
        Expect(r0a.body).toEqual(null);

        const r0b = await ws.dispatchRequest(fakedReq('HEAD', '/GET/0'));
        Expect(r0b.status).toEqual(WebStatus.NO_CONTENT);
        Expect(r0b.body).toEqual(null);

        const r1 = await ws.dispatchRequest(fakedReq('GET', '/GET/1'));
        Expect(r1.status).toEqual(WebStatus.OK);
        Expect(r1.body!.toString()).toEqual('1');

        Expect(JSON.parse((await ws.dispatchRequest(fakedReq('GET', '/GET/2'))).body!.toString())).toEqual([2]);
        Expect(JSON.parse((await ws.dispatchRequest(fakedReq('GET', '/GET/3'))).body!.toString())).toEqual({ value: 3 });

        const r4 = await ws.dispatchRequest(fakedReq('GET', '/GET/4'));
        Expect(r4.status).toEqual(WebStatus.ACCEPTED);
        Expect(r4.body).toEqual(null);

        const r5 = await ws.dispatchRequest(fakedReq('GET', '/GET/5'));
        Expect(r5.status).toEqual(WebStatus.ACCEPTED);
        Expect(r5.body!.toString()).toEqual('five');
        Expect(r5.headers.etag).toEqual('V');
        Expect((r5 as any).headers['custom-header']).toEqual('v');

        Expect((await ws.dispatchRequest(fakedReq('GET', '/GET/6'))).body!.toString()).toEqual('default');

        await Expect(() => ws.dispatchRequest(fakedReq('POST', '/GET/1'))).toThrowAsync();
        await Expect(() => ws.dispatchRequest(fakedReq('GET', '/GET/'))).toThrowAsync();
        await Expect(() => ws.dispatchRequest(fakedReq('GET', '/GET/A'))).toThrowAsync();
        await Expect(() => ws.dispatchRequest(fakedReq('GET', '/GET/10'))).toThrowAsync();
    }
}
