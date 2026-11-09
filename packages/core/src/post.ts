/**
 * Post text format ("markdown-lite"), parsed into a tree — never rendered as HTML strings.
 *
 * Stored (canonical) form:
 *   **bold**  _italic_ / *italic*  [text](https://…)  bare https://…  line breaks
 *   ||spoiler||                    $[Title](book:WORK_ID) or $[Title](book:WORK_ID:EDITION_ID)
 *   @handle                        #tag
 *
 * Editor form: book tokens are shown as `$[Title]` and resolved through a title → book map,
 * so the textarea stays readable and chips survive edits.
 */
import { slugify } from './text.ts';

export type PostNode =
	| { t: 'text'; v: string }
	| { t: 'br' }
	| { t: 'b'; c: PostNode[] }
	| { t: 'i'; c: PostNode[] }
	| { t: 'spoiler'; c: PostNode[] }
	| { t: 'link'; href: string; c: PostNode[] }
	| { t: 'book'; title: string; workId: string; editionId: string | null }
	| { t: 'mention'; handle: string }
	| { t: 'tag'; tag: string; slug: string };

export const POST_MAX = 2000;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const TOKEN = new RegExp(
	[
		String.raw`\$\[([^\]\n]{1,200})\]\(book:(${UUID})(?::(${UUID}))?\)`, // 1 title, 2 work, 3 edition
		String.raw`\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)`, // 4 text, 5 href
		String.raw`(https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"])`, // 6 bare url
		String.raw`\|\|([\s\S]+?)\|\|`, // 7 spoiler
		String.raw`\*\*([\s\S]+?)\*\*`, // 8 bold
		String.raw`(?<![\p{L}\p{N}*])\*(?!\s)([^*\n]+?)\*(?![\p{L}\p{N}*])`, // 9 italic *
		String.raw`(?<![\p{L}\p{N}_])_(?!\s)([^_\n]+?)_(?![\p{L}\p{N}_])`, // 10 italic _
		String.raw`(?<![\p{L}\p{N}_@.])@([a-zA-Z0-9_]{3,30})(?![a-zA-Z0-9_])`, // 11 mention
		String.raw`(?<![\p{L}\p{N}_#&/])#([\p{L}\p{N}_-]{1,40})`, // 12 tag
		String.raw`(\n)` // 13 newline
	].join('|'),
	'gu'
);

export function parsePost(body: string, depth = 0): PostNode[] {
	const out: PostNode[] = [];
	const re = new RegExp(TOKEN.source, TOKEN.flags);
	let last = 0;
	let m: RegExpExecArray | null;
	const text = (v: string) => {
		if (!v) return;
		const prev = out[out.length - 1];
		if (prev?.t === 'text') prev.v += v;
		else out.push({ t: 'text', v });
	};
	const inner = (s: string) => (depth >= 3 ? [{ t: 'text', v: s } as PostNode] : parsePost(s, depth + 1));
	while ((m = re.exec(body))) {
		text(body.slice(last, m.index));
		last = re.lastIndex;
		if (m[1] !== undefined) out.push({ t: 'book', title: m[1], workId: m[2]!, editionId: m[3] ?? null });
		else if (m[4] !== undefined) out.push({ t: 'link', href: m[5]!, c: inner(m[4]) });
		else if (m[6] !== undefined) out.push({ t: 'link', href: m[6], c: [{ t: 'text', v: m[6].replace(/^https?:\/\//, '').slice(0, 60) }] });
		else if (m[7] !== undefined) out.push({ t: 'spoiler', c: inner(m[7]) });
		else if (m[8] !== undefined) out.push({ t: 'b', c: inner(m[8]) });
		else if (m[9] !== undefined) out.push({ t: 'i', c: inner(m[9]) });
		else if (m[10] !== undefined) out.push({ t: 'i', c: inner(m[10]) });
		else if (m[11] !== undefined) out.push({ t: 'mention', handle: m[11].toLowerCase() });
		else if (m[12] !== undefined) {
			const slug = slugify(m[12], 40);
			if (slug) out.push({ t: 'tag', tag: m[12], slug });
			else text(m[0]);
		} else if (m[13] !== undefined) out.push({ t: 'br' });
	}
	text(body.slice(last));
	return out;
}

export interface PostRefs {
	books: { workId: string; editionId: string | null }[];
	mentions: string[];
	tags: { slug: string; name: string }[];
}

export function extractRefs(body: string): PostRefs {
	const refs: PostRefs = { books: [], mentions: [], tags: [] };
	const walk = (nodes: PostNode[]) => {
		for (const n of nodes) {
			if (n.t === 'book' && !refs.books.some((b) => b.workId === n.workId)) refs.books.push({ workId: n.workId, editionId: n.editionId });
			else if (n.t === 'mention' && !refs.mentions.includes(n.handle)) refs.mentions.push(n.handle);
			else if (n.t === 'tag' && !refs.tags.some((t) => t.slug === n.slug)) refs.tags.push({ slug: n.slug, name: n.tag });
			else if ('c' in n) walk(n.c);
		}
	};
	walk(parsePost(body));
	return refs;
}

/** Plain text (notifications, previews, search). Spoilers become ▒▒▒ unless `spoilers: 'show'`. */
export function toPlain(body: string, opts: { spoilers?: 'hide' | 'show' } = {}): string {
	const walk = (nodes: PostNode[]): string =>
		nodes
			.map((n) => {
				switch (n.t) {
					case 'text':
						return n.v;
					case 'br':
						return '\n';
					case 'book':
						return n.title;
					case 'mention':
						return `@${n.handle}`;
					case 'tag':
						return `#${n.tag}`;
					case 'spoiler':
						return opts.spoilers === 'show' ? walk(n.c) : '▒▒▒';
					default:
						return walk(n.c);
				}
			})
			.join('');
	return walk(parsePost(body)).replace(/[ \t]+/g, ' ').trim();
}

export type BookMap = Record<string, { workId: string; editionId: string | null }>;

/** Canonical → editor form: `$[Title](book:…)` becomes `$[Title]` plus a map entry. */
export function toEditable(body: string): { text: string; books: BookMap } {
	const books: BookMap = {};
	const re = new RegExp(String.raw`\$\[([^\]\n]{1,200})\]\(book:(${UUID})(?::(${UUID}))?\)`, 'g');
	const text = body.replace(re, (_, title: string, workId: string, editionId?: string) => {
		books[title] ??= { workId, editionId: editionId ?? null };
		return `$[${title}]`;
	});
	return { text, books };
}

/** Editor → canonical: `$[Title]` with a known title gets its book id back; unknown ones stay text. */
export function fromEditable(text: string, books: BookMap): string {
	return text.replace(/\$\[([^\]\n]{1,200})\](?!\(book:)/g, (whole, title: string) => {
		const b = books[title];
		return b ? `$[${title}](book:${b.workId}${b.editionId ? `:${b.editionId}` : ''})` : whole;
	});
}

/** Length as the user sees it (editor form), for the 2,000-character limit. */
export const visibleLength = (body: string) => toEditable(body).text.length;
