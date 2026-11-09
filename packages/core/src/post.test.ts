import { describe, expect, it } from 'vitest';
import { extractRefs, fromEditable, parsePost, toEditable, toPlain } from './post.ts';

const W = '01a1baf9-e02c-7967-a50d-efa3e8103a04';
const E = '01a1baf9-e034-7b3e-a5d1-efc4689f6d1f';

describe('post format', () => {
	it('parses books, mentions, tags, formatting and links', () => {
		const body = `Skończyłam $[Ostatnie życzenie](book:${W}:${E}) — **świetne**, _naprawdę_.\n@Ola zobacz #Fantastyka https://example.com/a.`;
		expect(parsePost(body)).toEqual([
			{ t: 'text', v: 'Skończyłam ' },
			{ t: 'book', title: 'Ostatnie życzenie', workId: W, editionId: E },
			{ t: 'text', v: ' — ' },
			{ t: 'b', c: [{ t: 'text', v: 'świetne' }] },
			{ t: 'text', v: ', ' },
			{ t: 'i', c: [{ t: 'text', v: 'naprawdę' }] },
			{ t: 'text', v: '.' },
			{ t: 'br' },
			{ t: 'mention', handle: 'ola' },
			{ t: 'text', v: ' zobacz ' },
			{ t: 'tag', tag: 'Fantastyka', slug: 'fantastyka' },
			{ t: 'text', v: ' ' },
			{ t: 'link', href: 'https://example.com/a', c: [{ t: 'text', v: 'example.com/a' }] },
			{ t: 'text', v: '.' }
		]);
	});

	it('does not treat emails, snake_case or URLs fragments as tokens', () => {
		const nodes = parsePost('pisz na jan@example.com, zmienna snake_case_name, strona https://x.pl/#sekcja');
		expect(nodes.filter((n) => n.t !== 'text' && n.t !== 'link')).toEqual([]);
	});

	it('spoilers nest and are hidden in plain text', () => {
		const body = `Koniec: ||umiera **${'Gandalf'}**|| (żart)`;
		expect(parsePost(body)[1]).toEqual({ t: 'spoiler', c: [{ t: 'text', v: 'umiera ' }, { t: 'b', c: [{ t: 'text', v: 'Gandalf' }] }] });
		expect(toPlain(body)).toBe('Koniec: ▒▒▒ (żart)');
		expect(toPlain(body, { spoilers: 'show' })).toBe('Koniec: umiera Gandalf (żart)');
	});

	it('extracts references once each', () => {
		const body = `$[A](book:${W}) i znowu $[A](book:${W}) @ola @Ola #tag #Tag`;
		expect(extractRefs(body)).toEqual({ books: [{ workId: W, editionId: null }], mentions: ['ola'], tags: [{ slug: 'tag', name: 'tag' }] });
	});

	it('book chips survive the editor round trip', () => {
		const body = `Czytam $[The Hobbit](book:${W}:${E}) i $[Ostatnie](book:${E})`;
		const { text, books } = toEditable(body);
		expect(text).toBe('Czytam $[The Hobbit] i $[Ostatnie]');
		const edited = text.replace('Czytam', 'Kończę') + ' oraz $[Nieznana]';
		expect(fromEditable(edited, books)).toBe(`Kończę $[The Hobbit](book:${W}:${E}) i $[Ostatnie](book:${E}) oraz $[Nieznana]`);
	});

	it('keeps unknown markup as text and is safe with HTML', () => {
		expect(parsePost('<script>alert(1)</script> **niezamknięte')).toEqual([{ t: 'text', v: '<script>alert(1)</script> **niezamknięte' }]);
	});
});
