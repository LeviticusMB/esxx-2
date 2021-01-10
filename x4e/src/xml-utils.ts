import { DOMParser, XMLSerializer } from 'xmldom';

export const NS_DEFAULT   = '';
export const NS_XHTML     = 'http://www.w3.org/1999/xhtml';
export const NS_ATOM      = 'http://www.w3.org/2005/Atom';
export const NS_SOAP      = 'http://www.w3.org/2003/05/soap-envelope';
export const NS_WDSL      = 'http://www.w3.org/ns/wsdl';
export const NS_XLINK     = 'http://www.w3.org/1999/xlink';
export const NS_XMLSCHEMA = 'http://www.w3.org/2001/XMLSchema';
export const NS_XSLT      = 'http://www.w3.org/1999/XSL/Transform';

const ELEMENT_NODE                = 1;
const ATTRIBUTE_NODE              = 2;
const TEXT_NODE                   = 3;
// const CDATA_SECTION_NODE          = 4;
// const ENTITY_REFERENCE_NODE       = 5;
// const ENTITY_NODE                 = 6;
const PROCESSING_INSTRUCTION_NODE = 7;
const COMMENT_NODE                = 8;
const DOCUMENT_NODE               = 9;
const DOCUMENT_TYPE_NODE          = 10;
const DOCUMENT_FRAGMENT_NODE      = 11;
// const NOTATION_NODE               = 12;

const escapeMap: { [c: string]: string | undefined } = {
    '<':  '&lt;',
    '>':  '&gt;',
    '&':  '&amp;',
    '"':  '&quot;',
    "'":  '&apos;',
    "\t": '&#x9;',
    "\n": '&#xA;',
    "\r": '&#xD;',
}

export function escapeXML(value: string): string {
    return value.replace(/[<>&'"]/g, (c) => escapeMap[c] ?? '');
}

export function escapeXMLAttribute(value: string): string {
    return value.replace(/[<>&'"\t\n\r]/g, (c) => escapeMap[c] ?? '');
}

export function parseXMLFromString(document: string): Document {
    return new DOMParser().parseFromString(document, 'application/xml');
}

export function serializeXMLToString(node: Node): string {
    return new XMLSerializer().serializeToString(node);
}

export function isDOMNode(obj: unknown): obj is Node {
    return !!obj && typeof (obj as Node).nodeType === 'number';
}

export function isElement(node: Node): node is Element {
    return node.nodeType === ELEMENT_NODE;
}

export function isAttribute(node: Node): node is Attr {
    return node.nodeType === ATTRIBUTE_NODE;
}

export function isText(node: Node): node is Text {
    return node.nodeType === TEXT_NODE;
}

export function isProcessingInstruction(node: Node): node is ProcessingInstruction {
    return node.nodeType === PROCESSING_INSTRUCTION_NODE;
}

export function isComment(node: Node): node is Comment {
    return node.nodeType === COMMENT_NODE;
}

export function isDocument(node: Node): node is Document {
    return node.nodeType === DOCUMENT_NODE;
}

export function isDocumentType(node: Node): node is DocumentType {
    return node.nodeType === DOCUMENT_TYPE_NODE;
}

export function isDocumentFragment(node: Node): node is DocumentFragment {
    return node.nodeType === DOCUMENT_FRAGMENT_NODE;
}
