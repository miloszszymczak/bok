<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import BookCover from './BookCover.svelte';
	import Icon from './Icon.svelte';
	import SectionPicker, { type PickerTree } from './SectionPicker.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { lentLabel } from '#lib/utils/loans.ts';

	interface Book {
		copyId: string;
		workId: string;
		editionId: string;
		title: string;
		authors: string[];
		year: number | null;
		cover: string | null;
		lentTo?: string | null;
		dueOn?: string | null;
	}

	let { books, tree, current = null }: { books: Book[]; tree: PickerTree; current?: string | null } = $props();
	let selecting = $state(false);
	let selected = $state(new Set<string>());
	let picking = $state(false);
	let busy = $state(false);
	let moved = $state<number | null>(null);

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	async function moveTo(sectionId: string | null) {
		busy = true;
		try {
			const res = await fetch('/api/v1/copies/move', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ copyIds: [...selected], sectionId })
			});
			if (res.ok) moved = ((await res.json()) as { moved: number }).moved;
			selected = new Set();
			selecting = false;
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<div class="mb-2 flex items-center justify-between px-1">
	<p class="text-sm text-muted">{m.library_count({ count: books.length })}</p>
	{#if books.length}
		<button class="btn btn-ghost h-9 px-3 text-sm" onclick={() => ((selecting = !selecting), (selected = new Set()))}>{selecting ? m.common_cancel() : m.list_select()}</button>
	{/if}
</div>
{#if moved !== null}<p class="mb-2 rounded-xl bg-accent-soft px-4 py-2 text-sm" role="status">{m.list_moved({ count: moved })}</p>{/if}

{#if books.length}
	<ul class="card divide-y divide-line/60 p-1">
		{#each books as b (b.copyId)}
			<li>
				{#if selecting}
					<label class="flex items-center gap-3 rounded-xl p-2" data-copy={b.copyId}>
						<input type="checkbox" class="size-5 rounded border-line text-accent focus:ring-accent" checked={selected.has(b.copyId)} onchange={() => toggle(b.copyId)} />
						<BookCover src={b.cover} title={b.title} author={b.authors[0]} width={40} />
						<span class="min-w-0 flex-1"><span class="line-clamp-2 font-medium">{b.title}</span><span class="block truncate text-xs text-muted">{b.authors.join(', ')}</span></span>
					</label>
				{:else}
					<a href="/book/{b.workId}?e={b.editionId}" class="flex items-center gap-3 rounded-xl p-2" data-copy={b.copyId}>
						<BookCover src={b.cover} title={b.title} author={b.authors[0]} width={40} />
						<span class="min-w-0 flex-1"><span class="line-clamp-2 font-medium">{b.title}</span><span class="block truncate text-xs text-muted">{[b.authors.join(', '), b.year].filter(Boolean).join(' · ')}</span>{#if b.lentTo}<span class="block truncate text-xs font-semibold text-warn" data-testid="lent-label">{lentLabel(b.lentTo, b.dueOn ?? null)}</span>{/if}</span>
					</a>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

{#if selecting}
	<div class="fixed inset-x-0 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] z-40 px-4">
		<div class="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl bg-ink p-2 pl-4 text-bg shadow-lg">
			<span class="flex-1 text-sm font-medium">{m.list_selected({ count: selected.size })}</span>
			<button class="btn h-10 bg-bg px-3 text-sm text-ink" onclick={() => (selected = new Set(books.map((b) => b.copyId)))}>{m.list_select_all()}</button>
			<button class="btn btn-primary h-10 px-3 text-sm" disabled={!selected.size || busy} onclick={() => (picking = true)}><Icon name="forward" size={16} />{m.list_move_to()}</button>
		</div>
	</div>
{/if}

<SectionPicker {tree} bind:open={picking} title={m.list_move_to()} {current} allowUnsorted={current !== null} onpick={moveTo} />
