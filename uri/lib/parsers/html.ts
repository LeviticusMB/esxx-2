
import { AST, ParserStream, serialize } from 'parse5';
import { DOMImplementation } from 'xmldom';
import { isDOMNode, Parser, StringParser } from '../parsers';

export class HTMLParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<Document> {
        const parser = new ParserStream({ treeAdapter: new XMLTreeAdapter() });

        for await (const chunk of stream) {
            parser.write(chunk); // TODO: Encoding?
        }

        return parser.document as Document;
    }

    async *serialize(data: Node): AsyncIterableIterator<Buffer> {
        this.assertSerializebleData(isDOMNode(data), data);

        const html = serialize(data, { treeAdapter: new XMLTreeAdapter() });
        yield* new StringParser(this.contentType).serialize(html);
    }
}

export class XMLTreeAdapter implements AST.TreeAdapter {
    private root: Document;
    private created  = false;
    private template = Symbol('<template> content');
    private docMode  = Symbol('HTML document mode');

    constructor() {
        this.root = new DOMImplementation().createDocument(null, null!, null!);
    }

    createDocument(): Document {
        if (this.created) {
            throw new Error('XMLTreeAdapter can only create one document per instance');
        }
        else {
            this.created = true;
            return this.root;
        }
    }

    createDocumentFragment(): DocumentFragment {
        return this.root.createDocumentFragment();
    }

    createElement(tagName: string, namespaceURI: string, attrs: AST.Default.Attribute[]): Element {
        const element = this.root.createElementNS(namespaceURI, tagName);

        for (const attr of attrs) {
            if (attr.namespace) {
                element.setAttributeNS(attr.namespace, `${attr.prefix}:${attr.name}`, attr.value);
            }
            else {
                element.setAttribute(attr.name, attr.value);
            }
        }

        return element;
    }

    createCommentNode(data: string): Comment {
        return this.root.createComment(data);
    }

    appendChild(parentNode: Node, newNode: Node): void {
        parentNode.appendChild(newNode);
    }

    insertBefore(parentNode: Node, newNode: Node, referenceNode: Node): void {
        parentNode.insertBefore(newNode, referenceNode);
    }

    setTemplateContent(templateElement: Element, contentElement: DocumentFragment): void {
        (templateElement as any)[this.template] = contentElement;
    }

    getTemplateContent(templateElement: Element): DocumentFragment {
        return (templateElement as any)[this.template];
    }

    setDocumentType(_document: Document, name: string, publicId: string, systemId: string): void {
        console.log('setDocumentType not supported', name, publicId, systemId);
    }

    setDocumentMode(document: Document, mode: AST.DocumentMode): void {
        (document as any)[this.docMode] = mode;
    }

    getDocumentMode(document: Document): AST.DocumentMode {
        return (document as any)[this.docMode];
    }

    detachNode(node: Node): void {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }

    insertText(parentNode: Node, text: string): void {
        parentNode.appendChild(this.root.createTextNode(text)); // FIXME: Optimize
    }

    insertTextBefore(parentNode: Node, text: string, referenceNode: Node): void {
        parentNode.insertBefore(this.root.createTextNode(text), referenceNode); // FIXME: Optimize
    }

    adoptAttributes(recipient: Element, attrs: AST.Default.Attribute[]): void {
        for (const attr of attrs) {
            if (attr.namespace) {
                if (!recipient.hasAttributeNS(attr.namespace, attr.name)) {
                    recipient.setAttributeNS(attr.namespace, `${attr.prefix}:${attr.name}`, attr.value);
                }
            }
            else {
                if (recipient.hasAttribute(attr.name)) {
                    recipient.setAttribute(attr.name, attr.value);
                }
            }
        }
    }

    getFirstChild(node: Node): Node {
        return node.firstChild!;
    }

    getChildNodes(node: Node): Node[] {
        const nodes = [];

        for (let i = 0; i < node.childNodes.length; ++i) {
            nodes.push(node.childNodes.item(i));
        }

        return nodes;
    }

    getParentNode(node: Node): Node {
        return node.parentNode!;
    }

    getAttrList(element: Element): AST.Default.Attribute[] {
        const attrs = [];

        for (let i = 0; i < element.attributes.length; ++i) {
            const attr = element.attributes.item(i)!;
            attrs.push({
                name:      attr.name,
                value:     attr.value,
                namespace: attr.namespaceURI || undefined,
                prefix:    attr.prefix || undefined,
            });
        }

        return attrs;
    }

    getTagName(element: Element): string {
        return element.tagName;
    }

    getNamespaceURI(element: Element): string {
        return element.namespaceURI!;
    }

    getTextNodeContent(textNode: Text): string {
        return textNode.nodeValue!;
    }

    getCommentNodeContent(commentNode: Comment): string {
        return commentNode.nodeValue!;
    }

    getDocumentTypeNodeName(doctypeNode: DocumentType): string {
        return doctypeNode.name;
    }

    getDocumentTypeNodePublicId(doctypeNode: DocumentType): string {
        return doctypeNode.publicId;
    }

    getDocumentTypeNodeSystemId(doctypeNode: DocumentType): string {
        return doctypeNode.systemId;
    }

    isTextNode(node: Node): boolean {
        return node.nodeType === 3 /* Node.TEXT_NODE */;
    }

    isCommentNode(node: Node): boolean {
        return node.nodeType === 8 /* Node.COMMENT_NODE */;
    }

    isDocumentTypeNode(node: Node): boolean {
        return node.nodeType === 10 /* Node.DOCUMENT_TYPE_NODE */;
    }

    isElementNode(node: Node): boolean {
        return node.nodeType === 1 /* Node.ELEMENT_NODE */;
    }
}
