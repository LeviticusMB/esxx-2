import { inspect } from 'util';
import type { XML, XMLList } from '../x4e-types';
import { X4EList } from './x4e-list';
import { X4E } from './x4e-node';
import { Call, Get, GetOwnProperty, HasProperty, OwnPropertyKeys } from './x4e-utils';

export type CallMethod = (...args: unknown[]) => unknown;

export interface X4EProxyTarget {
    // § 9.1.1.1 (X4E: attributes optional)
    [Get](name: number, allowAttributes: boolean): Node | undefined;
    [Get](name: '*',    allowAttributes: boolean): Node[];
    [Get](name: '@*',   allowAttributes: true): Attr[];
    [Get](name: string | number, allowAttributes: boolean): Node | Node[] | undefined;

    // § 9.2.1.5 (X4E: attributes optional)
    [HasProperty](name: string | number, allowAttributes: boolean): boolean;

    // 11.2.2.1 Call X4E: Not really)
    [Call]?: CallMethod;

    // § 12.2 The for-in Statement
    [OwnPropertyKeys](): string[];
    [GetOwnProperty](p: string): PropertyDescriptor | undefined;

}

export function asXML<TNode extends Node>(node: TNode): XML<TNode> {
    return new Proxy(new X4E(node), X4EProxyHandler) as XML<TNode>;
}

export function asXMLList<TNode extends Node>(list: TNode | ArrayLike<TNode> | null | undefined): XMLList<TNode> {
    return new Proxy(new X4EList(list), X4EProxyHandler) as XMLList<TNode>;
}

function addCallMethod(dst: X4EProxyTarget, src: any, prop: string): typeof dst {
    if (typeof src[prop] === 'function') {
        dst[Call] = src[prop];
    }

    return dst;
}

export const X4EProxyHandler: ProxyHandler<X4EProxyTarget> = {
    // § 11.2.1 Property Accessors
    get: (target, p: string | symbol, receiver) => {
        if (typeof p === 'string' && p[0] !== '$') {
            const value = target[Get](p, false);

            if (value instanceof Array) {
                return addCallMethod(asXMLList(value), target, p);
            }
            else if (value) {
                return addCallMethod(asXML(value), target, p);
            }
            else {
                return value;
            }
        }

        return Reflect.get(target, p, receiver);
    },

    // § 9.1.1.6 (X4E: attributes optional)
    has: (target, p: string | symbol) => {
        if (typeof p === 'string' && p[0] !== '$') {
            return target[HasProperty](p, false);
        }

        return Reflect.has(target, p);
    },

    // 11.2.2.1 CallMethod (X4E: Not really)
    apply: (target, self, args) => {
        if (target[Call]) {
            return target[Call]?.apply(self, args);
        }

        return Reflect.apply(target as any, self, args);
    },

    ownKeys: (target) => {
        return [ ...Reflect.ownKeys(target), ...target[OwnPropertyKeys]() ];
    },

    getOwnPropertyDescriptor: (target, p) => {
        return Reflect.getOwnPropertyDescriptor(target, p) ?? (typeof p === 'string' && p[0] !== '$' ? target[GetOwnProperty](p) : undefined);
    },

    // Custom NodeJS inspector value: Hide this object from Node REPL
    [inspect.custom as any]() {
        return 'xml';
    }
}
