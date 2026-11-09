<script lang="ts">
	import { fromEditable, POST_MAX, type BookMap } from '@bok/core';
	import BookCover from './BookCover.svelte';
	import { m } from '#lib/paraglide/messages.js';

	type Vis = 'public' | 'followers' | 'friends' | 'private';
	/**
	 * Textarea with `$` books, `@` people and `#` tags autocomplete. Book tokens show as
	 * `$[Title]` and are mapped back to ids on send, so chips survive edits.
	 */
	let {
		initialText = '',
		initialBooks = {},
		visibility: initialVisibility = 'public',
		spoiler: initialSpoiler = false,
		submitLabel,
		maxLength = POST_MAX,
		compact = false,
		allowVisibility = true,
		onsubmit,
		oncancel
	}: {
		initialText?: string;
		initialBooks?: BookMap;
		visibility?: Vis;
		spoiler?: boolean;
		submitLabel: string;
		maxLength?: number;
		compact?: boolean;
		allowVisibility?: boolean;
		onsubmit: (p: { body: string; visibility: Vis; spoiler: boolean }) => Promise<boolean>;
		oncancel?: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let text = $state(initialText);
	// svelte-ignore state_referenced_locally
	let books = $state<BookMap>({ ...initialBooks });
	// svelte-ignore state_referenced_locally
	let visibility = $state<Vis>(initialVisibility);
	// svelte-ignore state_referenced_locally
	let spoiler = $state(initialSpoiler);
	let busy = $state(false);
	let failed = $state(false);
	let el: HTMLTextAreaElement;

	type Suggestion =
		| { kind: 'book'; workId: string; editionId: string | null; title: string; authors: string[]; cover: string | null; mine: boolean }
		| { kind: 'person'; handle: string; displayName: string; avatar: string | null; friends: boolean }
		| { kind: 'tag'; slug: string; name: string };
	let suggestions = $state<Suggestion[]>([]);
	let trigger = $state<{ char: '$' | '@' | '#'; start: number; query: string } | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let seq = 0;

	const length = $derived(text.length);

	function detect() {
		const caret = el.selectionStart ?? text.length;
		const before = text.slice(0, caret);
		// `$` may span words (book titles), `@`/`#` stop at whitespace.
		const book = /(^|[\s(])\$([^$\[\]\n]{1,40})$/.exec(before);
		const other = /(^|[\s(])([@#])([\p{L}\p{N}_-]{0,30})$/u.exec(before);
		const hit = book ? { char: '$' as const, query: book[2]!, start: caret - book[2]!.length - 1 } : other ? { char: other[2] as '@' | '#', query: other[3]!, start: caret - other[3]!.length - 1 } : null;
		trigger = hit;
		if (timer) clearTimeout(timer);
		if (!hit || (hit.char === '$' && hit.query.trim().length < 2) || (hit.char === '#' && hit.query.length < 1)) {
			suggestions = [];
			return;
		}
		timer = setTimeout(() => void fetchSuggestions(hit), 150);
	}

	async function fetchSuggestions(hit: NonNullable<typeof trigger>) {
		const mySeq = ++seq;
		const path = hit.char === '$' ? 'books' : hit.char === '@' ? 'people' : 'tags';
		const res = await fetch(`/api/v1/suggest/${path}?q=${encodeURIComponent(hit.query.trim())}`).catch(() => null);
		if (!res?.ok || mySeq !== seq) return;
		const data = (await res.json()) as Record<string, unknown>[];
		suggestions = data.map((d) => (hit.char === '$' ? { kind: 'book', ...d } : hit.char === '@' ? { kind: 'person', ...d } : { kind: 'tag', ...d })) as Suggestion[];
	}

	function pick(s: Suggestion) {
		if (!trigger) return;
		let insert = '';
		if (s.kind === 'book') {
			// Same title twice for different books: make the label unique.
			let label = s.title.replace(/[[\]]/g, '');
			if (books[label] && books[label]!.workId !== s.workId) label = `${label} (${s.authors[0] ?? s.workId.slice(0, 4)})`;
			books = { ...books, [label]: { workId: s.workId, editionId: s.editionId } };
			insert = `$[${label}] `;
		} else if (s.kind === 'person') insert = `@${s.handle} `;
		else insert = `#${s.name.replace(/\s+/g, '')} `;
		const caret = el.selectionStart ?? text.length;
		const next = text.slice(0, trigger.start) + insert + text.slice(caret);
		const pos = trigger.start + insert.length;
		// Write the DOM value and caret synchronously, so a keystroke right after picking lands in place.
		el.value = next;
		el.focus();
		el.setSelectionRange(pos, pos);
		text = next;
		trigger = null;
		suggestions = [];
	}

	function wrapSpoiler() {
		const a = el.selectionStart ?? 0;
		const b = el.selectionEnd ?? a;
		const sel = text.slice(a, b) || m.composer_spoiler_placeholder();
		text = `${text.slice(0, a)}||${sel}||${text.slice(b)}`;
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(a + 2, a + 2 + sel.length);
		});
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!text.trim() || length > maxLength) return;
		busy = true;
		failed = false;
		const ok = await onsubmit({ body: fromEditable(text, books), visibility, spoiler });
		busy = false;
		if (ok) {
			text = '';
			books = {};
			spoiler = false;
		} else failed = true;
	}
</script>

<form class="relative space-y-2" onsubmit={submit} data-testid="composer">
	<textarea
		bind:this={el}
		bind:value={text}
		oninput={detect}
		onclick={detect}
		onkeydown={(e) => {
			if (e.key === 'Escape') suggestions = [];
			if (e.key === 'Enter' && suggestions.length && !e.shiftKey) {
				e.preventDefault();
				pick(suggestions[0]!);
			}
		}}
		rows={compact ? 2 : 4}
		class="input resize-none"
		placeholder={compact ? m.composer_comment_placeholder() : m.composer_placeholder()}
		aria-label={compact ? m.composer_comment_placeholder() : m.composer_placeholder()}
		data-testid="composer-input"
	></textarea>

	{#if suggestions.length}
		<ul class="absolute inset-x-0 z-40 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface shadow-lg" role="listbox" data-testid="suggestions">
			{#each suggestions as s, i (i)}
				<li>
					<button type="button" class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-line/40" onclick={() => pick(s)} role="option" aria-selected={i === 0}>
						{#if s.kind === 'book'}
							<BookCover src={s.cover} title={s.title} width={28} />
							<span class="min-w-0 flex-1"><span class="block truncate font-medium">{s.title}</span><span class="block truncate text-xs text-muted">{s.authors.join(', ')}{s.mine ? ` · ${m.composer_in_library()}` : ''}</span></span>
						{:else if s.kind === 'person'}
							<span class="grid size-8 place-items-center rounded-full bg-accent-soft font-bold text-accent">{s.displayName.slice(0, 1)}</span>
							<span class="min-w-0 flex-1"><span class="block truncate font-medium">{s.displayName}</span><span class="text-xs text-muted">@{s.handle}{s.friends ? ` · ${m.social_friend()}` : ''}</span></span>
						{:else}
							<span class="font-semibold text-accent">#{s.name}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="flex flex-wrap items-center gap-2 text-sm">
		<button type="button" class="rounded-lg border border-line px-2 py-1 text-xs" onclick={wrapSpoiler} title={m.composer_spoiler_inline()}>||▒▒||</button>
		<label class="flex items-center gap-1.5 text-xs"><input type="checkbox" bind:checked={spoiler} class="size-4 rounded border-line text-accent focus:ring-accent" />{m.finish_spoiler()}</label>
		{#if allowVisibility}
			<select bind:value={visibility} class="input h-8 w-auto py-0 text-xs" aria-label={m.finish_visibility()}>
				<option value="public">{m.visibility_public()}</option>
				<option value="followers">{m.visibility_followers()}</option>
				<option value="friends">{m.visibility_friends()}</option>
				<option value="private">{m.visibility_private()}</option>
			</select>
		{/if}
		<span class="ml-auto text-xs {length > maxLength ? 'font-bold text-danger' : 'text-muted'}">{length}/{maxLength}</span>
		{#if oncancel}<button type="button" class="btn btn-ghost h-9 px-3 text-sm" onclick={oncancel}>{m.common_cancel()}</button>{/if}
		<button class="btn btn-primary h-9 px-4 text-sm" disabled={busy || !text.trim() || length > maxLength} data-testid="composer-submit">{submitLabel}</button>
	</div>
	{#if !compact}<p class="text-xs text-muted">{m.composer_hint()}</p>{/if}
	{#if failed}<p class="field-error">{m.error_generic()}</p>{/if}
</form>
