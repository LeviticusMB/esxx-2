
export * from './uri';

import { URI } from './uri';

var u : URI;
u=new URI('/etc/fäle.txt?nåpe')
console.log(""+u, u.toString(), String(u));

u=new URI('http://user:password@höst.name:99/%7Epath/tå/?q1=2&q2&q3=nej#fragment&and&parts')
console.log(""+u, u.toString(), u);

u=new URI('jdbc:h2:mem:?reconnect=true');
console.log(""+u, u.toString(), u);

u=new URI('mailto:märtin@blom.org?subject=hej%20hopp&content-type=text/html&to=foo@bar.com&x-body=nej&body=hejhej', '#no');
console.log(""+u, u.toString(), u);

let host='ldap.datan.blom.org';
let user='martin/blom@doo?lod';

console.log(URI.$`ldap://${host}/??(cn=${user})`)
console.log(URI.encodeURI`ldap://${host}/??(cn=${user})`)
console.log(URI.encodeURIComponent`ldap://${host}/??(cn=${user})`)
