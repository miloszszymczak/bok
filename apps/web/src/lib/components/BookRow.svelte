<script lang="ts">
	import type { Snippet } from 'svelte';
	import BookCover from './BookCover.svelte';

	let {
		href,
		title,
		authors = [],
		meta = '',
		cover,
		srcset,
		trailing
	}: { href: string; title: string; authors?: string[]; meta?: string; cover?: string | null; srcset?: string; trailing?: Snippet } = $props();
</script>

<div class="flex items-center gap-2 rounded-xl pr-2 transition hover:bg-line/40">
	<a {href} class="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 active:bg-line/60">
		<BookCover src={cover} {srcset} {title} author={authors[0]} width={52} />
		<div class="min-w-0 flex-1">
			<p class="line-clamp-2 font-serif text-[17px] leading-snug font-semibold">{title}</p>
			{#if authors.length}<p class="truncate text-sm text-muted">{authors.join(', ')}</p>{/if}
			{#if meta}<p class="truncate text-xs text-muted">{meta}</p>{/if}
		</div>
	</a>
	{@render trailing?.()}
</div>
