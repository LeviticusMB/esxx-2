import { inspect, InspectOptions } from 'util';
import type { XML, XMLList } from '../x4e-types';
import { isComment, isDOMNode, isElement, isProcessingInstruction } from '../xml-utils';
import { asXML, asXMLList, CallMethod, X4EProxyTarget } from './x4e-magic';
import { X4E } from './x4e-node';
import { Call, ConvertableTypes, domNodeList, Get, GetOwnProperty, HasProperty, isInteger, OwnPropertyKeys, parseXMLFragment, Value } from './x4e-utils';

export class X4EList<TNode extends Node> extends Function implements X4EProxyTarget, Iterable<XML<TNode>> {
    private [Value]: TNode[];

    length: never;

    constructor(value: TNode | ArrayLike<TNode> | undefined | null) {
        super('throw TypeError("XMLList is not a function")');

        this[Value] = !value ? [] : isDOMNode(value) ? [ value ] : Array.from<TNode>(value);
    }

    // Custom NodeJS inspector value: XML array
    [inspect.custom](depth: number, options: InspectOptions) {
        return this[Value].map((node) => node.toString());
    }

    // § 9.2.1.1 (X4E: attributes optional)
    [Get](name: number, allowAttributes: boolean): Node | undefined;
    [Get](name: '*',    allowAttributes: boolean): Node[];
    [Get](name: '@*',   allowAttributes: true): Attr[];
    [Get](name: string, allowAttributes: boolean): Node[];
    [Get](name: string | number, allowAttributes: boolean): Node | Node[] | undefined;
    [Get](name: string | number, allowAttributes: boolean): Node | Node[] | undefined {
        if (isInteger(name)) {
            return this[Value][name];
        }
        else {
            return this[Value].flatMap((node) => isElement(node) ? new X4E(node)[Get](name, allowAttributes)! : []);
        }
    }

    // § 9.2.1.5 (X4E: attributes optional)
    [HasProperty](name: string | number, allowAttributes: boolean): boolean {
        const propValue = this[Get](name, allowAttributes);

        return Array.isArray(propValue) ? propValue.length > 0 : !!propValue ;
    }

    // 11.2.2.1 CallMethod (X4E: Not really)
    [Call]?: CallMethod;

    // § 12.2 The for-in Statement
    [OwnPropertyKeys](): string[] {
        return Object.keys(this[Value]);
    }

    // § 12.2 The for-in Statement
    [GetOwnProperty](p: string): PropertyDescriptor | undefined {
        const node = isInteger(p) && this[Value][p];

        return node
            ? { value: asXML(node), writable: true, enumerable: true, configurable: true }
            : undefined;
    }

    // § 12.3 The for-each-in Statement (X4E: for-of)
    *[Symbol.iterator](): Generator<XML<TNode>> {
        for (const node of this[Value]) {
            yield asXML(node);
        }
    }

    // § 11.2.1 Property Accessors (X4E: tagged template alias for attributes)
    $(name: TemplateStringsArray): XMLList<Attr> {
        return this.$attribute(name[0]);
    }

    // § 11.2.3 XML Descendant Accessor (X4E: tagged template alias)
    $$(name: TemplateStringsArray): XMLList<Element> {
        return this.$descendants(name[0]);
    }

    // § 11.2.4 XML Filtering Predicate Operator (X4E: as method)
    $filter(predicate: (node: XML<TNode>, index: number, parent: XMLList<TNode>) => boolean): XMLList<TNode> {
        return asXMLList(this[Value].filter((node, index) => predicate(asXML(node), index, this as unknown as XMLList<TNode>)));
    }

    // § 13.5.4.1 constructor

    // § 13.5.4.2
    $attribute(name: string): XMLList<Attr> {
        return concatXMLLists(this, (node) => node.$attribute(name));
    }

    // § 13.5.4.3
    $attributes(): XMLList<Attr> {
        return concatXMLLists(this, (node) => node.$attributes());
    }

    // § 13.5.4.4
    $child(name: string | number): XMLList<Node> {
        return concatXMLLists(this, (node) => node.$child(name));
    }

    // § 13.5.4.5
    $children(): XMLList<Node> {
        return concatXMLLists(this, (node) => node.$children());
    }

    // § 13.5.4.6
    $comments(): XMLList<Comment> {
        return concatXMLLists(this, (node) => node.$comments());
    }

    // § 13.5.4.7 constructor

    // § 13.5.4.8
    // $contains(value: X4E<Node>): boolean {
    //     return this[VALUE].some((node) => node == value.$domNode());
    // }

    // § 13.5.4.9
    $copy(): XMLList<TNode> {
        return asXMLList(this[Value].map((node) => node.cloneNode(true) as TNode));
    }

    // § 13.5.4.10
    $descendants(name?: string): XMLList<Element> {
        return concatXMLLists(this, (node) => node.$descendants(name));
    }

    // § 13.5.4.11
    $elements(name?: string): XMLList<Element> {
        return concatXMLLists(this, (node) => node.$elements(name));
    }

    // § 13.5.4.12 hasOwnProperty (X4E: Reuse super method)

    // § 13.5.4.13
    $hasComplexContent(): boolean {
        if (this[Value].length === 0) {
            return false;
        }
        else if (this[Value].length === 1) {
            return new X4E(this[Value][0]).$hasComplexContent()
        }
        else {
            return this[Value].some((node) => isElement(node));
        }
    }

    // 13.5.4.14
    $hasSimpleContent(): boolean {
        if (this[Value].length === 0) {
            return true;
        }
        else if (this[Value].length === 1) {
            return new X4E(this[Value][0]).$hasSimpleContent()
        }
        else {
            return this[Value].every((node) => !isElement(node));
        }
    }

    // § 13.5.4.15
    $length(): number {
        return this[Value].length;
    }

    // § 13.5.4.16
    $normalize(): this {
        this[Value].forEach((node) => node.normalize());
        return this;
    }

    // § 13.5.4.17
    $parent(): XML<Element | Document | DocumentFragment> | null | undefined {
        if (this[Value].length === 0) {
            return undefined;
        }
        else {
            const parent = this[Value][0].parentNode as Element | Document | DocumentFragment;

            return this[Value].every((node) => node.parentNode === parent) ? asXML(parent) : undefined;
        }
    }

    // § 13.5.4.18
    $processingInstructions(name?: string): XMLList<ProcessingInstruction> {
        return concatXMLLists(this, (node) => node.$processingInstructions(name));
    }

    // § 13.5.4.19 propertyIsEnumerable (X4E: Reuse super method)

    // § 13.5.4.20
    $text(): XMLList<Text> {
        return concatXMLLists(this, (node) => node.$text());
    }

    // § 13.5.4.21
    $toString(): string {
        if (this.$hasSimpleContent()) {
            return this[Value].map((node) => isComment(node) || isProcessingInstruction(node) ? '' : new X4E(node).$toString()).join('');
        }
        else {
            return this.$toXMLString();
        }
    }

    toString(): string {
        return this.$toString();
    }

    // § 13.5.4.22
    $toXMLString(): string {
        return this[Value].map((node) => new X4E(node).$toXMLString()).join('');
    }

    // § 13.5.4.23 valueOf (X4E: Reuse super method)

    // A.2.1
    $domNode(): TNode | undefined {
        return this[Value].length === 1 ? this[Value][0] : undefined;
    }

    // A.2.2
    $domNodeList(): NodeListOf<TNode> {
        return domNodeList(this[Value]);
    }

    // A.2.3 xpath
}

function concatXMLLists<TNode extends Node>(parent: X4EList<Node>, fn: (child: X4E<Node>) => XMLList<TNode>) {
    return asXMLList(parent[Value].flatMap((node) => (fn(new X4E(node)) as unknown as X4EList<TNode>)[Value]));
}

// § 10.4 (X4E: Explicit default namespace & copy)
export function ToXMLList(value: ConvertableTypes | ArrayLike<Node>, defaultNamespace: string, shallowCopy: boolean): XMLList<Node> {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean' ||
        value instanceof String || value instanceof Number || value instanceof BigInt || value instanceof Boolean) {

        value = asXMLList(parseXMLFragment(String(value).replace(/^<>|<\/>$/g, '') /* Remove <> and </> */, defaultNamespace).childNodes);
        shallowCopy = false;
    }
    else if (isDOMNode(value) || Array.isArray(value) && value.every((node) => isDOMNode(node))) {
        value = asXMLList(value);
        shallowCopy = false;
    }

    if (value instanceof X4E) {
        return asXMLList(value.$domNode());
    }
    else if (value instanceof X4EList) {
        return shallowCopy ? asXMLList(value.$domNodeList()) : (value as XMLList<Node>);
    }
    else {
        throw new TypeError(`Cannot convert ${value} to XML`);
    }
}
