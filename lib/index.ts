
export * from './uri';

import { FileProtocol } from './protocols/file';
import { HTTPProtocol } from './protocols/http';
import { URI } from './uri';

// Register all built-in protocols

URI
    .register("file",  FileProtocol)
    .register("http",  HTTPProtocol)
    .register("https", HTTPProtocol)
;

new URI('http://localhost/~leviticus/').save(10)
.then((data) => console.log('then', data));
