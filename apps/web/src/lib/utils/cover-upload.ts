import { resizeToWebp } from './image.ts';

/** Three WebP sizes matching the server's cover variants (120/320/640px wide). */
export async function coverVariants(file: Blob) {
	const [s, m, l] = await Promise.all([resizeToWebp(file, 180), resizeToWebp(file, 480), resizeToWebp(file, 960)]);
	return { s, m, l };
}
