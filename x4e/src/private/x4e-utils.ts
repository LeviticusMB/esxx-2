import type { XML, XMLList } from '../x4e-types';
import { escapeXML, isElement, parseXMLFromString } from '../xml-utils';

export const Call            = Symbol('Call');
export const Get             = Symbol('Get');
export const GetOwnProperty  = Symbol('GetOwnProperty');
export const HasProperty     = Symbol('HasProperty');
export const OwnPropertyKeys = Symbol('OwnPropertyKeys');
export const Value           = Symbol('Value');

// eslint-disable-next-line @typescript-eslint/ban-types
export type ConvertableTypes = string | number | bigint | boolean | String | Number | BigInt | Boolean | XML<Node> | XMLList<Node> | Node;

export const nodeTypes = [
    null,
    'element',
    'attribute',
    'text',
    'cdata-section',
    'entity-reference',
    'entity',
    'processing-instruction',
    'comment',
    'document',
    'document-type',
    'document-fragment',
    'notation',
]

export function parseXMLFragment(fragment: string, defaultNamespace: string): Element {
    try {
        return parseXMLFromString(`<parent xmlns="${escapeXML(defaultNamespace)}">${fragment}</parent>`).documentElement;
    }
    catch (err: any) {
        throw new SyntaxError(err.message ?? String(err));
    }
}

export function isInteger(i: number | string): i is number /* a lie! */ {
    return String(Number(i)) == i;
}

export function filerChildNodes<TNode extends Node = Node>(parent: Node, filter: (node: Node, index: number, parent: Node) => boolean): TNode[] {
    const elements: TNode[] = [];

    for (let node = parent.firstChild, index = 0; node; node = node.nextSibling, ++index) {
        if (filter(node, index, parent)) {
            elements.push(node as unknown as TNode);
        }
    }

    return elements;
}

export function getChildElementsByTagName(parent: Node, name?: string): Element[] {
    const namespaceURI = null /* FIXME */, localName = name ?? '*';

    return filerChildNodes<Element>(parent, (node) =>
        isElement(node) &&
        (localName === '*' || localName == node.localName) &&
        (namespaceURI === null || namespaceURI === node.namespaceURI));
}

export function domNodeList<TNode extends Node>(list: TNode[]): NodeListOf<TNode> {
    const nodeList = Object.create(list, {
        item:    { enumerable: false , value: (i: number) => list[i] ?? null },
        forEach: { enumerable: false , value: (cb: (value: TNode, key: number, parent: NodeListOf<TNode>) => void, thisArg?: any) => {
            list.forEach((value, key) => cb.call(thisArg, value, key, nodeList));
        }}
    });

    return nodeList;
}

export interface ElementLike {
    readonly localName?: string;
    readonly namespaceURI?: string | null;
    readonly prefix?: string | null;
    readonly tagName?: string;
    attributes?: NamedNodeMap;

    hasAttribute?(qualifiedName: string): boolean;
    hasAttributeNS?(namespace: string | null, localName: string): boolean;
    hasAttributes?(): boolean;

    getAttribute?(qualifiedName: string): string | null;
    getAttributeNS?(namespace: string | null, localName: string): string | null;
    getAttributeNames?(): string[];
    getAttributeNode?(qualifiedName: string): Attr | null;
    getAttributeNodeNS?(namespace: string | null, localName: string): Attr | null;

    getElementsByTagName?(qualifiedName: string): ArrayLike<Element>;
    getElementsByTagNameNS?(namespaceURI: string, localName: string): ArrayLike<Element>;
}
