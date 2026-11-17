/**
 * USB / Bluetooth barcode scanners in keyboard ("HID wedge") mode type the code very fast and
 * finish with Enter (sometimes Tab). People don't: we only treat a burst as a scan when every
 * key follows the previous one within `maxGapMs` and it's at least `minLength` characters.
 */
export interface WedgeOptions {
	maxGapMs?: number;
	minLength?: number;
}

export class WedgeBuffer {
	private chars: string[] = [];
	private last = -Infinity;
	private readonly maxGap: number;
	private readonly minLength: number;

	constructor(o: WedgeOptions = {}) {
		this.maxGap = o.maxGapMs ?? 60;
		this.minLength = o.minLength ?? 4;
	}

	/** Feed one key (`e.key`) with its time; returns the scanned code on the terminator, else null. */
	push(key: string, now: number): string | null {
		const fast = now - this.last <= this.maxGap;
		this.last = now;
		if (key === 'Enter' || key === 'Tab') {
			const code = fast && this.chars.length >= this.minLength ? this.chars.join('') : null;
			this.chars = [];
			return code;
		}
		if (key.length !== 1) return null; // Shift and friends: scanners send them for capitals
		if (!fast) this.chars = [];
		this.chars.push(key);
		return null;
	}

	reset() {
		this.chars = [];
		this.last = -Infinity;
	}
}

const editable = (t: EventTarget | null) =>
	t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement);

/**
 * Listen for hardware scans anywhere on the page. Typing in a form field is left alone (a scan
 * into a focused field just fills it, as users expect). Returns the unsubscribe function.
 */
export function listenWedge(onScan: (code: string) => void, o?: WedgeOptions) {
	const buf = new WedgeBuffer(o);
	const onKey = (e: KeyboardEvent) => {
		if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || editable(e.target)) {
			buf.reset();
			return;
		}
		const code = buf.push(e.key, e.timeStamp || performance.now());
		if (code) {
			// The terminator would otherwise press whatever button has focus.
			e.preventDefault();
			e.stopPropagation();
			onScan(code);
		}
	};
	addEventListener('keydown', onKey, true);
	return () => removeEventListener('keydown', onKey, true);
}
