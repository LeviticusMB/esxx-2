import { EventEmitter } from 'events';

export function isReadableStream(obj: any): obj is NodeJS.ReadableStream;
export function isReadableStream(obj: NodeJS.ReadableStream): obj is NodeJS.ReadableStream {
    return obj instanceof EventEmitter && typeof obj.readable === 'boolean' && typeof obj.read === 'function';
}

export function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
