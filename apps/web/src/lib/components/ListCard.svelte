<script lang="ts">
	import { booksText } from '#lib/utils/reading.ts';
	import BookCover from './BookCover.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Card {
		id: string;
		title: string;
		description: string;
		visibility: 'private' | 'unlisted' | 'public';
		ownerHandle: string;
		ownerName: string;
		count: number;
		covers: { title: string; url: string | null }[];
	}
	let { list, href, showOwner = false, showVisibility = false }: { list: Card; href: string; showOwner?: boolean; showVisibility?: boolean } = $props();
</script>

<a {href} class="card flex items-center gap-4 p-3" data-list={list.title}>
	<div class="relative h-[72px] w-[78px] shrink-0">
		{#each list.covers.slice(0, 3) as c, i (i)}
			<div class="absolute top-0" style="left:{i * 15}px;z-index:{3 - i}"><BookCover src={c.url} title={c.title} width={48} /></div>
		{:else}
			<div class="grid h-[72px] w-12 place-items-center rounded-md border border-dashed border-line text-xs text-muted">—</div>
		{/each}
	</div>
	<div class="min-w-0 flex-1">
		<p class="truncate font-serif text-lg font-semibold">{list.title}</p>
		<p class="truncate text-sm text-muted">
			{booksText(list.count)}{#if showOwner} · {list.ownerName}{/if}{#if showVisibility} · {list.visibility === 'public' ? m.list_vis_public() : list.visibility === 'unlisted' ? m.list_vis_unlisted() : m.list_vis_private()}{/if}
		</p>
		{#if list.description}<p class="truncate text-xs text-muted">{list.description}</p>{/if}
	</div>
</a>
