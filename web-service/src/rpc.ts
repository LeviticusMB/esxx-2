import { WebArguments } from './resource';
import { WebService } from './service';
import { escapeRegExp } from './utils';

type RPCMethods<M> = Record<keyof M, [object, object]>;

export type RPCMethodParams<M extends RPCMethods<M>, K extends keyof M> = M[K] extends [infer A, infer B] ? A : never;
export type RPCMethodResult<M extends RPCMethods<M>, K extends keyof M> = M[K] extends [infer A, infer B] ? B : never;

export type RPCServiceAPI<M extends RPCMethods<M>> = {
    [K in keyof M]: (request: RPCMethodParams<M, K>, args: WebArguments) => Promise<RPCMethodResult<M, K>>;
}

export type RPCClientAPI<M extends RPCMethods<M>> = {
    [K in keyof M]: (request: RPCMethodParams<M, K>) => Promise<RPCMethodResult<M, K>>;
}

export interface RPCEndpointOptions {
    path?: string;
}

export type RPCEndpointConfig<M extends RPCMethods<M>> = Record<keyof M, RPCEndpointOptions | null>;

export type RPCClientProxy<M extends RPCMethods<M>> = (method: keyof M, options: Required<RPCEndpointOptions>, params: object) => Promise<object>
export type RPCSeviceProxy<M extends RPCMethods<M>> = (method: keyof M, options: Required<RPCEndpointOptions>, args: WebArguments, fn: (params: object) => Promise<object>) => Promise<object>

function endpoints<M extends RPCMethods<M>>(endpoints: RPCEndpointConfig<M>): Array<[keyof M, Required<RPCEndpointOptions>]> {
    return Object.entries(endpoints)
        .map(([method, options]) => [method as keyof M, {
            path: method,
            ...(options as RPCEndpointOptions | null ?? {})
        }]);
}

export function createRPCClient<M extends RPCMethods<M>>(config: RPCEndpointConfig<M>, clientProxy: RPCClientProxy<M>): RPCClientAPI<M> {
    return new class RPCClientAPI {
        constructor() {
            const self = this as any;

            for (const [method, options] of endpoints(config)) {
                self[method] = (params: object) => clientProxy(method, options, params);
            }
        }
    } as RPCClientAPI<M>;
}

export function addRPCResources<M extends RPCMethods<M>, C>(ws: WebService<C>, config: RPCEndpointConfig<M>, impl: RPCServiceAPI<M>, serviceProxy: RPCSeviceProxy<M>): typeof ws {
    for (const [method, options] of endpoints(config)) {
        ws.addResource(class {
            static path = RegExp(escapeRegExp(options.path));

            async POST(args: WebArguments): Promise<object> {
                return serviceProxy(method, options, args, (params) => impl[method](params as any, args) as Promise<object>);
            }
        });
    }

    return ws;
}
