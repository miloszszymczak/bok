import { createHash } from 'node:crypto';

/** Bump when the card design or fonts change, so every cached preview image is re-rendered. */
const RENDERER = 2;

/** Content hash for preview-image URLs (?v=…): a changed list/book/profile gets a new image URL. */
export const ogVersion = (parts: unknown[]) => createHash('sha1').update(JSON.stringify([RENDERER, ...parts])).digest('hex').slice(0, 10);
