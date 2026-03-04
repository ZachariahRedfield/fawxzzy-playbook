import path from 'node:path';

export const toPosixPath = (value: string): string => value.split(path.sep).join('/');
