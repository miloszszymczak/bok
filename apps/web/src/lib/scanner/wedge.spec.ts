import { describe, expect, it } from 'vitest';
import { WedgeBuffer } from './wedge.ts';

const feed = (b: WedgeBuffer, keys: string[], start: number, gap: number) => {
	let out: string | null = null;
	keys.forEach((k, i) => {
		const r = b.push(k, start + i * gap);
		if (r) out = r;
	});
	return out;
};

describe('WedgeBuffer', () => {
	it('recognises a fast burst ending with Enter', () => {
		const b = new WedgeBuffer();
		expect(feed(b, [...'9788375780635', 'Enter'], 1000, 8)).toBe('9788375780635');
	});
	it('keeps capitals typed with Shift and accepts Tab as terminator', () => {
		const b = new WedgeBuffer();
		expect(feed(b, ['Shift', 'B', 'Shift', 'O', 'Shift', 'K', '-', '0', '1', 'J', 'N', 'R', 'Z', 'Tab'], 0, 5)).toBe('BOK-01JNRZ');
	});
	it('ignores human typing and short bursts', () => {
		const b = new WedgeBuffer();
		expect(feed(b, [...'hello', 'Enter'], 0, 140)).toBeNull();
		expect(feed(b, [...'ab', 'Enter'], 5000, 5)).toBeNull();
	});
	it('starts over after a pause, so stray keys before a scan do not stick', () => {
		const b = new WedgeBuffer();
		b.push('x', 0);
		expect(feed(b, [...'SHELF-7', 'Enter'], 2000, 10)).toBe('SHELF-7');
	});
	it('a slow Enter after a fast burst is not a scan', () => {
		const b = new WedgeBuffer();
		feed(b, [...'12345678'], 0, 5);
		expect(b.push('Enter', 900)).toBeNull();
	});
});
