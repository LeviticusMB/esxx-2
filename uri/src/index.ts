export * from './auth-schemes';
export * from './auth-schemes/basic';
export * from './auth-schemes/bearer';
export * from './auth-schemes/hawk';
export * from './parsers';
export * from './uri';

export { KVPairs } from '@divine/headers';

import { AuthScheme } from './auth-schemes';
import { Parser } from './parsers';
import { URI }    from './uri';

// Register all built-in auth-schemes
import { BasicAuthScheme }  from './auth-schemes/basic';
import { BearerAuthScheme } from './auth-schemes/bearer';

AuthScheme
    .register('basic',  BasicAuthScheme)
    .register('bearer', BearerAuthScheme)
;

// Register all built-in protocols
import { FileProtocol } from './protocols/file';
import { HTTPProtocol } from './protocols/http';

URI
    .register('file:',  FileProtocol)
    .register('http:',  HTTPProtocol)
    .register('https:', HTTPProtocol)
;

// Register all built-in parsers
import { CSVParser }  from './parsers/csv';
import { HTMLParser } from './parsers/html';

Parser
    .register('text/csv',                   CSVParser)
    .register('text/html',                  HTMLParser)
    .register('text/tab-separated-values',  CSVParser)
    .register('text/tsv' /* Unofficial */,  CSVParser)
;
