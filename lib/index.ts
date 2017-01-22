
export * from './uri';

import { URI } from './uri';

new URI('http://localhost/~leviticus/').save(10)
.then((data) => console.log('then', data));
