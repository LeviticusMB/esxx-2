export * from './auth-schemes';
export * from './auth-schemes/basic';
export * from './auth-schemes/bearer';
export * from './auth-schemes/hawk';
export * from './parsers';
export * from './parsers/csv';
export * from './parsers/html';
export * from './protocols/file';
export * from './protocols/http';
export * from './uri';

export { KVPairs } from '@divine/headers';

// Register all built-in auth-schemes
import './auth-schemes/basic';
import './auth-schemes/bearer';

// Register all built-in protocols
import './protocols/cache';
import './protocols/file';
import './protocols/http';

// Register all built-in parsers
import './parsers';
import './parsers/csv';
import './parsers/html';
