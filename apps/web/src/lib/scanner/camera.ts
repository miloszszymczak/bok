import type { ConfigRequest, DecodeRequest, DecodeResponse } from './decoder.worker.ts';

/** Region of the video frame that is decoded — also drawn as the on-screen guide. */
export function bandRect(vw: number, vh: number) {
	const w = Math.round(vw * 0.86);
	const h = Math.round(Math.min(vh * 0.6, w * 0.5));
	return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };
}

/** Map a frame-space rectangle onto an element showing the video with object-fit: cover. */
export function toCoverSpace(r: { x: number; y: number; w: number; h: number }, vw: number, vh: number, cw: number, ch: number) {
	const scale = Math.max(cw / vw, ch / vh);
	const ox = (cw - vw * scale) / 2;
	const oy = (ch - vh * scale) / 2;
	return { x: r.x * scale + ox, y: r.y * scale + oy, w: r.w * scale, h: r.h * scale };
}

export interface CameraCaps {
	torch: boolean;
	zoom: { min: number; max: number } | null;
}

export interface ScannerEvents {
	onCode(code: string, addon: string | null): void;
	onStats?(s: { engine: string; ms: number }): void;
	/** Skip the native BarcodeDetector (debugging / testing the WASM path). */
	forceZxing?: boolean;
}

interface ExtendedCaps extends MediaTrackCapabilities {
	torch?: boolean;
	zoom?: { min: number; max: number; step?: number };
	focusMode?: string[];
}

/**
 * Owns the camera stream and the decode loop. Frames are cropped to the guide band
 * (where the barcode is aimed), downscaled, and handed to the worker as ImageBitmaps.
 * Only one frame is in flight at a time, so a slow device simply decodes fewer frames.
 */
export class Scanner {
	private stream: MediaStream | null = null;
	private worker: Worker | null = null;
	private running = false;
	private busy = false;
	private seq = 0;
	private lastFrame = 0;
	private video: HTMLVideoElement | null = null;
	caps: CameraCaps = { torch: false, zoom: null };

	constructor(private readonly events: ScannerEvents) {}

	get track(): MediaStreamTrack | null {
		return this.stream?.getVideoTracks()[0] ?? null;
	}

	async start(video: HTMLVideoElement) {
		this.video = video;
		if (!this.stream) {
			this.stream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
			});
		}
		video.srcObject = this.stream;
		video.muted = true;
		video.playsInline = true;
		await video.play();

		const c = (this.track?.getCapabilities?.() ?? {}) as ExtendedCaps;
		this.caps = { torch: !!c.torch, zoom: c.zoom && c.zoom.max > c.zoom.min ? { min: c.zoom.min, max: c.zoom.max } : null };
		if (c.focusMode?.includes('continuous')) {
			await this.track?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
		}

		if (!this.worker) {
			this.worker = new Worker(new URL('./decoder.worker.ts', import.meta.url), { type: 'module' });
			this.worker.onmessage = (e: MessageEvent<DecodeResponse>) => {
				this.busy = false;
				this.events.onStats?.({ engine: e.data.engine, ms: e.data.ms });
				for (const c of e.data.codes) this.events.onCode(c.text, c.addon);
			};
			if (this.events.forceZxing) this.worker.postMessage({ config: { forceZxing: true } } satisfies ConfigRequest);
		}
		this.running = true;
		this.loop();
	}

	private loop = () => {
		if (!this.running || !this.video) return;
		const v = this.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
		if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(this.tick);
		else requestAnimationFrame(this.tick);
	};

	private tick = async () => {
		const v = this.video;
		const now = performance.now();
		if (v && !this.busy && now - this.lastFrame > 50 && v.videoWidth > 0) {
			this.lastFrame = now;
			const { x: sx, y: sy, w: sw, h: sh } = bandRect(v.videoWidth, v.videoHeight);
			const resizeWidth = Math.min(sw, 1000);
			try {
				const bitmap = await createImageBitmap(v, sx, sy, sw, sh, { resizeWidth, resizeHeight: Math.round((sh * resizeWidth) / sw) });
				this.busy = true;
				this.worker?.postMessage({ id: ++this.seq, bitmap } satisfies DecodeRequest, [bitmap]);
			} catch {
				this.busy = false;
			}
		}
		this.loop();
	};

	async setTorch(on: boolean) {
		await this.track?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
	}

	async setZoom(z: number) {
		await this.track?.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] });
	}

	/** Best effort: nudge focus to the tapped point where the browser supports it. */
	async focusAt(x: number, y: number) {
		await this.track
			?.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }], focusMode: 'single-shot' } as MediaTrackConstraintSet] })
			.catch(() => this.track?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {}));
	}

	/** Pause decoding (e.g. page hidden) but keep the stream so iOS doesn't ask for permission again. */
	pause() {
		this.running = false;
	}

	resume() {
		if (this.video && this.stream && !this.running) {
			this.running = true;
			void this.video.play().catch(() => {});
			this.loop();
		}
	}

	stop() {
		this.running = false;
		this.stream?.getTracks().forEach((t) => t.stop());
		this.stream = null;
		this.worker?.terminate();
		this.worker = null;
		if (this.video) this.video.srcObject = null;
	}
}
