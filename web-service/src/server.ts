import { once } from 'events';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { WebService } from './service';

export class WebServer {
    public server: Server;

    constructor(public readonly host: string, public readonly port: number, public readonly service: WebService<any>) {
        this.server = createServer(service.requestEventHandler());
    }

    async start(): Promise<this> {
        await once(this.server.listen(this.port, this.host), 'listening');

        return this;
    }

    async stop(): Promise<this> {
        await new Promise((resolve, reject) => {
            this.server.close((err) => err ? reject(err) : resolve(this));
        });

        return this.wait();
    }

    async wait(): Promise<this> {
        await once(this.server, 'close');

        return this;
    }

    addressInfo(): AddressInfo {
        return this.server.address() as AddressInfo;
    }
}
