<script lang="ts">
	import BookCover from './BookCover.svelte';
	import Icon from './Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import RatingStars from './RatingStars.svelte';
	import { statusLabel } from '#lib/utils/reading.ts';
	import type { BookSummary, BorrowedSummary, OwnedCopy, ReadingSummary } from '#lib/client/types.ts';
	import { lentLabel, shortDate } from '#lib/utils/loans.ts';

	export interface VerdictState {
		code: string;
		loading: boolean;
		offline: boolean;
		book?: BookSummary;
		copies: OwnedCopy[];
		sameWorkOtherEditions: number;
		notFound: boolean;
		cachedCount: number;
		ms?: number;
		reading?: ReadingSummary | null;
		borrowed?: BorrowedSummary[];
	}

	let { v, onadd, adding = false }: { v: VerdictState; onadd: () => void; adding?: boolean } = $props();

	const owned = $derived(v.copies.length > 0);
	const lentCopies = $derived(v.copies.filter((c) => c.state === 'lent'));
	const lent = $derived(lentCopies.length);
	const tone = $derived(owned ? 'bg-accent text-accent-ink' : v.sameWorkOtherEditions ? 'bg-warn text-white' : 'bg-surface border border-line');
</script>

<section class="overflow-hidden rounded-2xl {tone}" aria-live="polite" data-verdict={owned ? 'owned' : v.sameWorkOtherEditions ? 'other-edition' : v.notFound ? 'unknown' : 'not-owned'}>
	<div class="flex items-center gap-2 px-4 pt-4 pb-3">
		<Icon name={owned ? 'check' : v.sameWorkOtherEditions ? 'copy' : 'store'} size={24} />
		<p class="font-serif text-xl font-bold">
			{#if owned}
				{m.verdict_owned({ count: v.copies.length })}
			{:else if v.sameWorkOtherEditions}
				{m.verdict_other_edition()}
			{:else if v.notFound}
				{m.verdict_unknown()}
			{:else if v.loading}
				{m.verdict_checking()}
			{:else}
				{m.verdict_not_owned()}
			{/if}
		</p>
	</div>
	{#if lent}
		<p class="px-4 pb-2 text-sm font-medium" data-testid="verdict-lent">
			{#if lentCopies.every((c) => c.lentTo)}{lentCopies.map((c) => lentLabel(c.lentTo!, c.dueOn ?? null)).join(' · ')}{:else}{m.verdict_lent({ count: lent })}{/if}
		</p>
	{/if}
	{#each v.borrowed ?? [] as b, i (i)}
		<p class="px-4 pb-2 text-sm font-medium" data-testid="verdict-borrowed">{b.dueOn ? m.verdict_borrowed_until({ name: b.from, date: shortDate(b.dueOn) }) : m.verdict_borrowed({ name: b.from })}</p>
	{/each}
	{#if v.reading && (v.reading.status || v.reading.timesRead)}
		<p class="flex flex-wrap items-center gap-2 px-4 pb-3 text-sm font-medium" data-testid="verdict-reading">
			{#if v.reading.timesRead}
				<span>{m.verdict_read_before({ count: v.reading.timesRead })}</span>
				<RatingStars value={v.reading.lastRating} />
			{:else if v.reading.status}
				<span>{v.reading.status === 'want_to_read' ? m.verdict_on_want() : statusLabel(v.reading.status)}</span>
			{/if}
		</p>
	{/if}

	<div class="flex items-center gap-3 bg-surface p-3 text-ink">
		{#if v.book}
			<BookCover src={v.book.cover} title={v.book.title} author={v.book.authors[0]} width={48} />
			<div class="min-w-0 flex-1">
				<p class="line-clamp-2 font-serif font-semibold">{v.book.title}</p>
				<p class="truncate text-sm text-muted">{[v.book.authors.join(', '), v.book.year].filter(Boolean).join(' · ')}</p>
			</div>
		{:else}
			<p class="flex-1 font-mono text-sm text-muted">{v.code}</p>
		{/if}
		{#if !owned && !v.notFound && !v.loading}
			<button class="btn btn-primary h-10 shrink-0 px-3 text-sm" onclick={onadd} disabled={adding}><Icon name="plus" size={16} />{m.verdict_add()}</button>
		{/if}
	</div>
	{#if v.offline}
		<p class="flex items-center gap-1.5 bg-surface px-3 pb-3 text-xs text-muted"><Icon name="offline" size={14} />{m.verdict_offline({ count: v.cachedCount })}</p>
	{/if}
</section>
