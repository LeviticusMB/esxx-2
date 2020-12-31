import { escapeHTMLAttribute, parseHTMLFragmentFromString, parseHTMLFromString } from './html-utils';
import { ToXMLList, X4EList } from './private/x4e-list';
import { ToXML, X4E } from './private/x4e-node';
import type { ConvertableTypes } from './private/x4e-utils';
import type { XML as _XML, XMLConstructor, XMLList as _XMLList, XMLListConstructor } from './x4e-types';
import { escapeXMLAttribute } from './xml-utils';

// § 13.4.1 / 13.4.2 (X4E: Explicit default namespace)
export type XML<TNode extends Node> = _XML<TNode>;
export const XML = function(this: XML<Node> | void, value?: ConvertableTypes | null | undefined, defaultNamespace = '') {
    return ToXML(value === null || value === undefined ? '' : value, defaultNamespace, this instanceof XML);
} as XMLConstructor;

XML.prototype = X4E.prototype;

// § 13.5.1 / 13.5.2 (X4E: Explicit default namespace)
export type XMLList<TNode extends Node> = _XMLList<TNode>;
export const XMLList = function(this: XMLList<Node> | void, value?: ConvertableTypes | ArrayLike<Node> | null | undefined, defaultNamespace = '') {
    return ToXMLList(value === null || value === undefined ? '' : value, defaultNamespace, this instanceof XMLList);
} as XMLListConstructor;

XMLList.prototype = X4EList.prototype;

// § 8.3 XML Initialiser Input Elements
// § 11.1.5 XMLList Initialiser

type XMLLiteral  = <TNode extends Node = Element>(strings: TemplateStringsArray, ...values: unknown[]) => XML<TNode>;
type XMLListLiteral = <TNode extends Node = Node>(strings: TemplateStringsArray, ...values: unknown[]) => XMLList<TNode>;

export function xmlNS(defaultNamespace: string): XMLLiteral {
    return function xml<TNode extends Node = Element>(strings: TemplateStringsArray, ...values: unknown[]): XML<TNode> {
        return XML(strings[0] + values.map((value, i) => escapeXMLAttribute(String(value)) + strings[i + 1]).join(''), defaultNamespace);
    }
}

export function xmlListNS(defaultNamespace: string): XMLListLiteral {
    return function xmlList<TNode extends Node = Node>(strings: TemplateStringsArray, ...values: unknown[]): XMLList<TNode> {
        return XMLList(strings[0] + values.map((value, i) => escapeXMLAttribute(String(value)) + strings[i + 1]).join(''), defaultNamespace);
    }
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): XML<Element> {
    return XML(parseHTMLFromString(strings[0] + values.map((value, i) => escapeHTMLAttribute(String(value)) + strings[i + 1])).documentElement);
}

export function htmlList<TNode extends Node = Node>(strings: TemplateStringsArray, ...values: unknown[]): XMLList<TNode> {
    return XML(parseHTMLFragmentFromString(strings[0] + values.map((value, i) => escapeHTMLAttribute(String(value)) + strings[i + 1]))).$children() as XMLList<TNode>;
}

export const xml       = xmlNS('');
export const xmlList   = xmlListNS('');

export const xhtml     = xmlNS('http://www.w3.org/1999/xhtml');
export const xhtmlList = xmlListNS('http://www.w3.org/1999/xhtml');

// export const atom        = xmlNS('http://www.w3.org/2005/Atom');
// export const soap        = xmlNS('http://www.w3.org/2003/05/soap-envelope');
// export const wdsl        = xmlNS('http://www.w3.org/ns/wsdl');
// export const xlink       = xmlNS('http://www.w3.org/1999/xlink');
// export const xmlschema   = xmlNS('http://www.w3.org/2001/XMLSchema');
// export const xslt        = xmlNS('http://www.w3.org/1999/XSL/Transform');
