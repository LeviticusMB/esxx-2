// tslint:disable-next-line: no-implicit-dependencies
import { Expect, Test } from 'alsatian';
import { IncomingMessage } from 'http';
import { WebArguments, WebRequest, WebResponse, WebService, WebStatus } from '../src';

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
        errorMessageProperty: 'message',
        maxContentLength:     1_000_000,
        trustRequestID:       null,
        trustForwardedFor:    false,
        trustForwardedHost:   false,
        trustForwardedProto:  false,
        trustMethodOverride:  false,
        returnRequestID:      null,
    });
}

export class WebServiceTest {
    @Test() async dispatch() {
        const ws = new WebService('context')
            .addResource(class {
                static path = /default/;

                constructor(args: WebArguments, context: string) {
                    Expect(args.request.url.href).toBe('http://localhost/default?foo');
                    Expect(context).toBe('context');
                }

                async default(args: WebArguments) {
                    return `default ${args.request.method}`;
                }
            })
            .addResource(class {
                static path = /options/;

                async OPTIONS(args: WebArguments) {
                    Expect(args.request.method).toBe('OPTIONS');
                    return `options ${args.request.method}`;
                }
            })
            .addResource(class {
                static path = /other/;

                async GET() {
                    return null;
                }
            });

        const r1 = await ws.dispatchRequest(fakedReq('X-SPECIAL', '/default?foo'));
        Expect(r1.status).toBe(WebStatus.OK);
        Expect(r1.body!.toString()).toBe('default X-SPECIAL');

        const r2 = await ws.dispatchRequest(fakedReq('OPTIONS', '/options'));
        Expect(r2.status).toBe(WebStatus.OK);
        Expect(r2.body!.toString()).toBe('options OPTIONS');

        const r3 = await ws.dispatchRequest(fakedReq('OPTIONS', '/other'));
        Expect(r3.status).toBe(WebStatus.OK);
        Expect(r3.body).toBe(null);
        Expect(r3.headers.allow).toEqual('GET, HEAD, OPTIONS');

        await Expect(() => ws.dispatchRequest(fakedReq('POST', '/options'))).toThrowAsync();
    }

    @Test() async responses() {
        const ws = new WebService('context')
            .addResource(class {
                static path = /GET\/(?<id>\d)/;
                private digit: number;

                constructor(args: WebArguments) {
                    Expect(args.string('$1') === args.string('$id')).toBe(true);
                    this.digit = args.number('$1');
                }

                async GET(args: WebArguments) {
                    Expect(args.string('$1') === args.string('$id')).toBe(true);

                    switch (this.digit) {
                        case 0: return null;
                        case 1: return '1';
                        case 2: return [2];
                        case 3: return { value: 3 };
                        case 4: return new WebResponse(WebStatus.ACCEPTED, null);
                        case 5: return new WebResponse(WebStatus.ACCEPTED, 'five', { etag: 'V'}).setHeader('Custom-Header', 'v');
                        default: return 'default';
                    }
                }
            });

        const r0a = await ws.dispatchRequest(fakedReq('GET', '/GET/0'));
        Expect(r0a.status).toBe(WebStatus.NO_CONTENT);
        Expect(r0a.body).toBe(null);

        const r0b = await ws.dispatchRequest(fakedReq('HEAD', '/GET/0'));
        Expect(r0b.status).toBe(WebStatus.NO_CONTENT);
        Expect(r0b.body).toBe(null);

        const r1 = await ws.dispatchRequest(fakedReq('GET', '/GET/1'));
        Expect(r1.status).toBe(WebStatus.OK);
        Expect(r1.body!.toString()).toBe('1');

        Expect(JSON.parse((await ws.dispatchRequest(fakedReq('GET', '/GET/2'))).body!.toString())).toEqual([2]);
        Expect(JSON.parse((await ws.dispatchRequest(fakedReq('GET', '/GET/3'))).body!.toString())).toEqual({ value: 3 });

        const r4 = await ws.dispatchRequest(fakedReq('GET', '/GET/4'));
        Expect(r4.status).toBe(WebStatus.ACCEPTED);
        Expect(r4.body).toBe(null);

        const r5 = await ws.dispatchRequest(fakedReq('GET', '/GET/5'));
        Expect(r5.status).toBe(WebStatus.ACCEPTED);
        Expect(r5.body!.toString()).toBe('five');
        Expect(r5.headers.etag).toBe('V');
        Expect((r5 as any).headers['custom-header']).toBe('v');

        Expect((await ws.dispatchRequest(fakedReq('GET', '/GET/6'))).body!.toString()).toBe('default');

        await Expect(() => ws.dispatchRequest(fakedReq('POST', '/GET/1'))).toThrowAsync();
        await Expect(() => ws.dispatchRequest(fakedReq('GET', '/GET/'))).toThrowAsync();
        await Expect(() => ws.dispatchRequest(fakedReq('GET', '/GET/A'))).toThrowAsync();
        await Expect(() => ws.dispatchRequest(fakedReq('GET', '/GET/10'))).toThrowAsync();
    }
}
