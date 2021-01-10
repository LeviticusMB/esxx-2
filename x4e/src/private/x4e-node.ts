import { inspect, InspectOptions } from 'util';
import type { XML, XMLList } from '../x4e-types';
import { escapeXML, isAttribute, isComment, isDOMNode, isElement, isProcessingInstruction, isText } from '../xml-utils';
import { X4EList } from './x4e-list';
import { asXML, asXMLList, CallMethod, X4EProxyTarget } from './x4e-magic';
import { Call, ConvertableTypes, domNodeList, ElementLike, filerChildNodes, Get, getChildElementsByTagName, GetOwnProperty, HasProperty, isInteger, nodeTypes, OwnPropertyKeys, parseXMLFragment, Value } from './x4e-utils';

export class X4E<TNode extends Node> implements X4EProxyTarget, Iterable<XML<TNode>> {
    private [Value]: TNode & ElementLike;

    constructor(node: TNode) {
        this[Value] = node;
    }

    // Custom NodeJS inspector value: XML
    [inspect.custom](depth: number, options: InspectOptions) {
        return this[Value].toString();
    }

    // § 9.1.1.1 (X4E: attributes optional)
    [Get](name: number, allowAttributes: boolean): Node | undefined;
    [Get](name: '*',    allowAttributes: boolean): Node[];
    [Get](name: '@*',   allowAttributes: true): Attr[];
    [Get](name: string | number, allowAttributes: boolean): Node | Node[] | undefined;
    [Get](name: string | number, allowAttributes: boolean): Node | Node[] | undefined {
        if (isInteger(name)) {
            return [this[Value]][name];
        }
        else if (allowAttributes && name[0] === '@') {
            const namespaceURI = null /* FIXME */, localName = name.substr(1);

            return Array.from(this[Value].attributes ?? []).filter((attr) =>
                (localName    === '*'  || localName    === attr.localName) &&
                (namespaceURI === null || namespaceURI === attr.namespaceURI));
        }
        else {
            const namespaceURI = null /* FIXME */, localName = name;

            return filerChildNodes(this[Value], (node) =>
                (localName    === '*'  || isElement(node) && localName    === node.localName) &&
                (namespaceURI === null || isElement(node) && namespaceURI === node.namespaceURI));
        }
    }

    // § 9.1.1.6 (X4E: attributes optional)
    [HasProperty](name: string | number, allowAttributes: boolean): boolean {
        const propValue = this[Get](name, allowAttributes);

        return Array.isArray(propValue) ? propValue.length > 0 : !!propValue ;
    }

    // 11.2.2.1 CallMethod (X4E: Not really)
    [Call]?: CallMethod;

    // § 12.2 The for-in Statement
    [OwnPropertyKeys](): string[] {
        return ['0'];
    }

    // § 12.2 The for-in Statement
    [GetOwnProperty](p: string): PropertyDescriptor | undefined {
        return p === '0'
            ? { value: this, writable: true, enumerable: true, configurable: true }
            : undefined;
    }

    // § 12.3 The for-each-in Statement (X4E: for-of)
    *[Symbol.iterator](): Generator<XML<TNode>> {
        yield this as unknown as XML<TNode>;
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
    $filter(predicate: (node: XML<TNode>, index: 0, parent: XML<TNode>) => boolean): XMLList<TNode> {
        return asXMLList(predicate(this as unknown as XML<TNode>, 0, this as unknown as XML<TNode>) ? this[Value] : null);
    }

    // § 13.4.4.1 constructor

    // § 13.4.4.2 addNamespace

    // § 13.4.4.3 appendChild

    // § 13.4.4.4
    $attribute(name: string): XMLList<Attr> {
        return asXMLList(this[Get](`@${name}` as '@*', true));
    }

    // § 13.4.4.5
    $attributes(): XMLList<Attr> {
        return asXMLList(this[Get](`@*`, true));
    }

    // § 13.4.4.6
    $child(name: string | number): XMLList<Node> {
        if (isInteger(name)) {
            return asXMLList((this[Get]('*', false))[name]);
        }
        else {
            return asXMLList(this[Get](name, false));
        }
    }

    // § 13.4.4.7
    // $childIndex(): number {
    // }

    // § 13.4.4.8
    $children(): XMLList<Node> {
        return asXMLList(this[Get]('*', false));
    }

    // § 13.4.4.9
    $comments(): XMLList<Comment> {
        return asXMLList(filerChildNodes<Comment>(this[Value], (node) => isComment(node)));
    }

    // § 13.4.4.10
    // $contains(value: X4E<Node>): boolean {
    //     return this == value;
    // }

    // § 13.4.4.11
    $copy(): XML<TNode> {
        return asXML(this[Value].cloneNode(true) as TNode);
    }

    // § 13.4.4.12
    $descendants(name?: string): XMLList<Element> {
        // FIXME: Not sure we're allowed to just call getElementsByTagName() ...
        return asXMLList<Element>(this[Value].getElementsByTagName?.(name ?? '*'));
    }

    // § 13.4.4.13
    $elements(name?: string): XMLList<Element> {
        return asXMLList(getChildElementsByTagName(this[Value], name ?? '*'));
    }

    // § 13.4.4.14 hasOwnProperty (X4E: Reuse super method)

    // § 13.4.4.15
    $hasComplexContent(): boolean {
        return !hasSimpleContent(this[Value]);
    }

    // § 13.4.4.16
    $hasSimpleContent(): boolean {
        return hasSimpleContent(this[Value]);
    }

    // § 13.4.4.17 inScopeNamespaces

    // § 13.4.4.18 insertChildAfter

    // § 13.4.4.19 insertChildBefore

    // § 13.4.4.20
    $length(): number {
        return 1;
    }

    // § 13.4.4.21
    $localName(): string | null {
        return this[Value].localName ?? null;
    }

    // § 13.4.4.22
    $name(): string | null {
        return this[Value].nodeName;
    }

    // § 13.4.4.23 namespace

    // § 13.4.4.24 namespaceDeclarations

    // § 13.4.4.25
    $nodeKind(): string {
        return nodeTypes[this[Value].nodeType] ?? 'unknown';
    }

    // § 13.4.4.26 (the X4E way?)
    $normalize(): this {
        this[Value].normalize();
        return this;
    }

    // § 13.4.4.27
    $parent(): XML<Element | Document | DocumentFragment> | null {
        return this[Value].parentNode && asXML(this[Value].parentNode as (Element | Document | DocumentFragment));
    }

    // § 13.4.4.28
    $processingInstructions(name?: string): XMLList<ProcessingInstruction> {
        name = name ?? '*';

        return asXMLList<ProcessingInstruction>(filerChildNodes(this[Value], (node) =>
            isProcessingInstruction(node) && (name === '*' || name === node.nodeName)));
    }

    // § 13.4.4.29 prependChild

    // § 13.4.4.30 propertyIsEnumerable (X4E: Reuse super method)

    // § 13.4.4.31 removeNamespace

    // § 13.4.4.32 replace

    // § 13.4.4.33 setChildren

    // § 13.4.4.34 setLocalName

    // § 13.4.4.35 setName

    //§ 13.4.4.36 setNamespace

    // § 13.4.4.37
    $text(): XMLList<Text> {
        return asXMLList<Text>(filerChildNodes(this[Value], (node) => isText(node)));
    }

    // § 13.4.4.38
    $toString(): string {
        return toString(this[Value]);
    }

    toString(): string {
        return this.$toString();
    }

    // § 13.4.4.39
    $toXMLString(): string {
        return isAttribute(this[Value]) ? escapeXML(this[Value].nodeValue ?? '') : this[Value].toString();
    }

    // § 13.4.4.40 valueOf (X4E: Reuse super method)

    // § A.1.1
    $domNode(): TNode {
        return this[Value];
    }

    // § A.1.2
    $domNodeList(): NodeListOf<TNode> {
        return domNodeList([ this[Value] ]);
    }

    // A.1.3 xpath
}

// § 13.4.4.15/13.4.4.16
function hasSimpleContent(node: Node): boolean {
    if (isComment(node) || isProcessingInstruction(node)) {
        return false;
    }
    else if (isText(node) || isAttribute(node)) {
        return true;
    }
    else {
        return getChildElementsByTagName(node, '*').length === 0;
    }
}

// § 10.1.1
function toString(node: Node): string {
    if (isAttribute(node) || isText(node)) {
        return node.nodeValue ?? '';
    }
    else if (hasSimpleContent(node)) {
        let result = '';

        for (let child = node.firstChild; child; child = child.nextSibling) {
            if (!isComment(child) && !isProcessingInstruction(child)) {
                result += toString(child);
            }
        }

        return result;
    }
    else {
        return node.toString();
    }
}

// § 10.3 (X4E: Explicit default namespace & copy)
export function ToXML(value: ConvertableTypes, defaultNamespace: string, deepCopy: boolean): XML<Node> {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean' ||
        value instanceof String || value instanceof Number || value instanceof BigInt || value instanceof Boolean) {

        const parent = parseXMLFragment(String(value), defaultNamespace);

        if (parent.childNodes.length === 0) {
            value = parent.ownerDocument.createTextNode('');
        }
        else if (parent.childNodes.length === 1) {
            value = parent.childNodes[0];
        }
        else {
            throw new SyntaxError(`XML objects can hold only one Node`);
        }

        deepCopy = false;
    }

    if (value instanceof X4E) {
        value = value as XML<Node>;

        return deepCopy ? value.$copy() : value;
    }
    else if (value instanceof X4EList) {
        value = value as XMLList<Node>;

        const node = value.$domNode();

        if (node) {
            return asXML(deepCopy ? node.cloneNode(true) : node);
        }
        else {
            throw new TypeError(`Cannot convert XMLList with length ${value.$length()} to XML`);
        }
    }
    else if (isDOMNode(value)) {
        return asXML(deepCopy ? value.cloneNode(true) : value);
    }
    else {
        throw new TypeError(`Cannot convert ${value} to XML`);
    }
}
