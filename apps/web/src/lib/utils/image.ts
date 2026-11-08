/** Downscale (and optionally centre-crop to a square) on the device before uploading. */
export async function resizeToWebp(file: Blob, max: number, square = false): Promise<Blob> {
	const bmp = await createImageBitmap(file);
	let sx = 0,
		sy = 0,
		sw = bmp.width,
		sh = bmp.height;
	if (square) {
		const side = Math.min(sw, sh);
		sx = (sw - side) / 2;
		sy = (sh - side) / 2;
		sw = sh = side;
	}
	const scale = Math.min(1, max / Math.max(sw, sh));
	const w = Math.round(sw * scale);
	const h = Math.round(sh * scale);
	const canvas = new OffscreenCanvas(w, h);
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
	bmp.close();
	return canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
}
