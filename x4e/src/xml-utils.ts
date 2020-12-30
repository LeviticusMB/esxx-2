import { DOMParser, XMLSerializer } from 'xmldom';

export const ELEMENT_NODE                = 1;
export const ATTRIBUTE_NODE              = 2;
export const TEXT_NODE                   = 3;
export const CDATA_SECTION_NODE          = 4;
export const ENTITY_REFERENCE_NODE       = 5;
export const ENTITY_NODE                 = 6;
export const PROCESSING_INSTRUCTION_NODE = 7;
export const COMMENT_NODE                = 8;
export const DOCUMENT_NODE               = 9;
export const DOCUMENT_TYPE_NODE          = 10;
export const DOCUMENT_FRAGMENT_NODE      = 11;
export const NOTATION_NODE               = 12;

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

export function isAttribute(node: Node): node is Attr {
    return node.nodeType === ATTRIBUTE_NODE;
}

export function isElement(node: Node): node is Element {
    return node.nodeType === ELEMENT_NODE;
}

export function isComment(node: Node): node is Comment {
    return node.nodeType === COMMENT_NODE;
}

export function isProcessingInstruction(node: Node): node is ProcessingInstruction {
    return node.nodeType === PROCESSING_INSTRUCTION_NODE;
}

export function isText(node: Node): node is Text {
    return node.nodeType === TEXT_NODE;
}
