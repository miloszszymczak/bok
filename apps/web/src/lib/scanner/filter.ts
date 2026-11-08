/**
 * Turns a noisy stream of decoder reads into deliberate scans:
 * - a code is accepted only after `confirmations` identical reads within `windowMs`;
 * - once accepted, the same code is ignored while it stays in view (reads less than
 *   `goneMs` apart), so holding the camera on a book never adds it twice;
 * - after it has been out of view for `goneMs`, scanning it again counts (second copy).
 */
export interface FilterOptions {
	confirmations?: number;
	windowMs?: number;
	goneMs?: number;
}

export class ScanFilter {
	private readonly confirmations: number;
	private readonly windowMs: number;
	private readonly goneMs: number;
	private candidate: { code: string; count: number; first: number } | null = null;
	private lastSeen = new Map<string, number>();
	private accepted = new Set<string>();

	constructor(o: FilterOptions = {}) {
		this.confirmations = o.confirmations ?? 2;
		this.windowMs = o.windowMs ?? 900;
		this.goneMs = o.goneMs ?? 1500;
	}

	/** Feed one decoder read; returns the code when it becomes a new scan, else null. */
	push(code: string, now: number): string | null {
		const prev = this.lastSeen.get(code);
		this.lastSeen.set(code, now);
		if (this.accepted.has(code)) {
			if (prev !== undefined && now - prev < this.goneMs) return null; // still in view
			this.accepted.delete(code); // it left and came back
		}
		if (!this.candidate || this.candidate.code !== code || now - this.candidate.first > this.windowMs) {
			this.candidate = { code, count: 1, first: now };
		} else {
			this.candidate.count++;
		}
		if (this.candidate.count >= this.confirmations) {
			this.candidate = null;
			this.accepted.add(code);
			return code;
		}
		return null;
	}

	/** Forget a code entirely (e.g. after Undo, so rescanning it works immediately). */
	forget(code: string) {
		this.accepted.delete(code);
		this.lastSeen.delete(code);
	}

	reset() {
		this.candidate = null;
		this.lastSeen.clear();
		this.accepted.clear();
	}
}
