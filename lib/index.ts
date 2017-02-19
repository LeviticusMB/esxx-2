export * from './parsers';
export * from './uri';

import { Parser } from './parsers';
import { URI }    from './uri';

import { FileProtocol } from './protocols/file';
import { HTTPProtocol } from './protocols/http';

// Register all built-in protocols
URI
    .register('file',  FileProtocol)
    .register('http',  HTTPProtocol)
    .register('https', HTTPProtocol)
;

import { HTMLParser } from './parsers/html';

Parser
    .register('text/html', HTMLParser);
