// Builds a Y4M video of barcodes for Chromium's fake camera (--use-file-for-fake-video-capture).
// Usage: node make-video.mjs out.y4m '[["9788375780635",4,1.5],[null,10,0]]'   ([code|null, seconds shown, seconds blank after])
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const zxingDir = fileURLToPath(new URL('.', import.meta.resolve('zxing-wasm/writer')));
const { prepareZXingModule, writeBarcode } = await import('zxing-wasm/writer');
const sharp = require('sharp');
prepareZXingModule({ overrides: { wasmBinary: readFileSync(`${zxingDir}../../writer/zxing_writer.wasm`) } });

const W = 480, H = 360, FPS = 5;
const [out, scriptJson] = process.argv.slice(2);
const script = JSON.parse(scriptJson);
const blank = Buffer.alloc(W * H, 235);
const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);

async function frameFor(code) {
	const r = await writeBarcode(code, { format: 'EAN-13', scale: 3, addQuietZones: true });
	if (r.error) throw new Error(r.error);
	const png = await sharp(Buffer.from(r.svg)).resize({ width: Math.round(W * 0.7) }).flatten({ background: '#fff' }).png().toBuffer();
	const y = await sharp({ create: { width: W, height: H, channels: 3, background: '#ebebeb' } })
		.composite([{ input: png, gravity: 'center' }])
		.toColourspace('b-w')
		.raw()
		.toBuffer();
	if (y.length !== W * H) throw new Error('expected a single luma channel');
	return y;
}

const fd = openSync(out, 'w');
writeSync(fd, `YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`);
const write = (y, seconds) => {
	for (let i = 0; i < Math.round(seconds * FPS); i++) {
		writeSync(fd, 'FRAME\n');
		writeSync(fd, y);
		writeSync(fd, chroma);
	}
};
for (const [code, show, after] of script) {
	write(code ? await frameFor(code) : blank, show);
	write(blank, after);
}
closeSync(fd);
