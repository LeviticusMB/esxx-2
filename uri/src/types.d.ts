
import 'xmldom';

declare module 'xmldom' {
    export interface DOMImplementationStatic {
        //new (features?: Object): DOMImplementationStatic;
        hasFeature(feature: string, version?: string): boolean;
        createDocument(namespaceURI: string | null, qualifiedName: string, doctype?: string): Document;
        createDocumentType(qualifiedName: string, publicId: string, systemId: string): DocumentType;
    }

    //export var DOMImplementation: DOMImplementationStatic;
}

