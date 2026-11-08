/// <reference lib="webworker" />
/**
 * Barcode decoding off the main thread. Uses the native BarcodeDetector where it supports
 * EAN-13 (Android Chrome), otherwise zxing-cpp compiled to WASM (iOS Safari, desktop).
 * The WASM file is self-hosted (no CDN) and precached by the service worker.
 */
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

export interface DecodeRequest {
	id: number;
	bitmap: ImageBitmap;
}
export interface ConfigRequest {
	config: { forceZxing: boolean };
}
export interface DecodeResponse {
	id: number;
	codes: { text: string; addon: string | null }[];
	engine: 'native' | 'zxing';
	ms: number;
}

prepareZXingModule({
	overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? new URL(wasmUrl, self.location.origin).href : prefix + path) }
});
// Fetch the WASM in the background right away (it is then cached by the service worker),
// so the decoder is ready — and available offline — even on devices that use the native detector today.
void fetch(new URL(wasmUrl, self.location.origin)).catch(() => {});

const ZXING_OPTS: ReaderOptions = {
	formats: ['EAN-13', 'EAN-8', 'UPC-A'],
	tryHarder: true,
	tryRotate: false,
	tryInvert: false,
	maxNumberOfSymbols: 1,
	eanAddOnSymbol: 'Read'
};

interface NativeDetector {
	detect(src: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]>;
}
let native: NativeDetector | null | undefined;
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

async function getNative(): Promise<NativeDetector | null> {
	if (native !== undefined) return native;
	native = null;
	const BD = (self as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): NativeDetector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
	if (BD) {
		try {
			const formats = await BD.getSupportedFormats();
			if (formats.includes('ean_13')) native = new BD({ formats: ['ean_13', 'ean_8', 'upc_a'] });
		} catch {
			/* fall back to zxing */
		}
	}
	return native;
}

function addonFrom(extra: string | undefined, text: string): string | null {
	if (extra) {
		try {
			const v = (JSON.parse(extra) as { EanAddOn?: string }).EanAddOn;
			if (v) return v;
		} catch {
			/* ignore */
		}
	}
	const m = /\s(\d{2}|\d{5})$/.exec(text);
	return m ? m[1]! : null;
}

self.onmessage = async (e: MessageEvent<DecodeRequest | ConfigRequest>) => {
	if ('config' in e.data) {
		if (e.data.config.forceZxing) native = null;
		return;
	}
	const { id, bitmap } = e.data;
	const t0 = performance.now();
	let codes: DecodeResponse['codes'] = [];
	let engine: DecodeResponse['engine'] = 'zxing';
	try {
		const det = await getNative();
		if (det) {
			engine = 'native';
			const found = await det.detect(bitmap);
			codes = found.map((f) => ({ text: f.rawValue, addon: null }));
		} else {
			if (!canvas || canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
				canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
				ctx = canvas.getContext('2d', { willReadFrequently: true });
			}
			ctx!.drawImage(bitmap, 0, 0);
			const img = ctx!.getImageData(0, 0, bitmap.width, bitmap.height);
			const results = await readBarcodes(img, ZXING_OPTS);
			codes = results
				.filter((r) => r.isValid)
				.map((r) => ({ text: r.text.split(' ')[0]!, addon: addonFrom((r as { extra?: string }).extra, r.text) }));
		}
	} catch (err) {
		console.error('decode failed', err);
	} finally {
		bitmap.close();
	}
	(self as unknown as Worker).postMessage({ id, codes, engine, ms: Math.round(performance.now() - t0) } satisfies DecodeResponse);
};
