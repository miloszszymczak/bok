<script lang="ts">
	import { onMount } from 'svelte';
	import BookCover from '#lib/components/BookCover.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import OgMeta from '#lib/components/OgMeta.svelte';
	import ShareButton from '#lib/components/ShareButton.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { booksText, monthName } from '#lib/utils/reading.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = $derived(data.stats);
	const name = $derived(data.person.displayName);

	type Slide = { id: string };
	const slides = $derived<Slide[]>(
		s.books
			? [
					{ id: 'intro' },
					{ id: 'count' },
					...(s.bestMonth !== null ? [{ id: 'month' }] : []),
					...(s.topAuthors[0] && s.topAuthors[0].count > 1 ? [{ id: 'author' }] : []),
					...(s.topRated.length ? [{ id: 'favs' }] : []),
					...(s.longest ? [{ id: 'longest' }] : []),
					...(data.goal ? [{ id: 'goal' }] : []),
					{ id: 'end' }
				]
			: [{ id: 'empty' }]
	);
	let i = $state(0);
	let paused = $state(false);
	const current = $derived(slides[Math.min(i, slides.length - 1)]!.id);
	const next = () => (i = Math.min(i + 1, slides.length - 1));
	const prev = () => (i = Math.max(i - 1, 0));

	// Stories-style: auto-advance (not on the last slide, not with reduced motion), tap left/right.
	onMount(() => {
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const t = setInterval(() => {
			if (!reduce && !paused && i < slides.length - 1) next();
		}, 4500);
		const key = (e: KeyboardEvent) => (e.key === 'ArrowRight' ? next() : e.key === 'ArrowLeft' ? prev() : null);
		addEventListener('keydown', key);
		return () => (clearInterval(t), removeEventListener('keydown', key));
	});
	function tap(e: MouseEvent) {
		const el = e.currentTarget as HTMLElement;
		if ((e.target as HTMLElement).closest('a,button')) return;
		if (e.clientX < el.getBoundingClientRect().width / 3) prev();
		else next();
	}
	const pagesText = (n: number) => m.year_pages({ n: n.toLocaleString() });
</script>

<svelte:head><title>{m.year_title({ name, year: data.year })} · bok</title></svelte:head>
<OgMeta title={m.year_title({ name, year: data.year })} description={`${booksText(s.books)} · ${pagesText(s.pages)}`} image={data.og.image} url={data.og.url} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-40 flex flex-col bg-ink text-bg select-none" onclick={tap} onpointerdown={() => (paused = true)} onpointerup={() => (paused = false)} data-testid="year" data-slide={current}>
	<div class="flex gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]" aria-hidden="true">
		{#each slides as sl, k (sl.id)}<span class="h-1 flex-1 overflow-hidden rounded-full bg-bg/25"><span class="block h-full bg-bg transition-all duration-500" style="width: {k <= i ? 100 : 0}%"></span></span>{/each}
	</div>
	<div class="flex items-center justify-between px-3 py-2">
		<span class="text-sm opacity-80">{name} · {data.year}</span>
		<a href="/u/{data.person.handle}?tab=stats" class="grid size-10 place-items-center rounded-full hover:bg-bg/10" aria-label={m.common_close()}><Icon name="x" /></a>
	</div>

	{#key current}
		<section class="year-slide flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center" aria-live="polite">
			{#if current === 'empty'}
				<p class="font-serif text-3xl font-bold">{m.year_empty({ year: data.year })}</p>
			{:else if current === 'intro'}
				<p class="text-lg opacity-80">{name}</p>
				<p class="font-serif text-5xl leading-tight font-bold">{m.year_intro({ year: data.year })}</p>
			{:else if current === 'count'}
				<p class="font-serif text-8xl font-bold tabular-nums" data-testid="year-books">{s.books}</p>
				<p class="text-xl">{m.year_books_read()}</p>
				{#if s.pages}<p class="text-lg opacity-80">{pagesText(s.pages)}</p>{/if}
			{:else if current === 'month'}
				<p class="text-lg opacity-80">{m.year_best_month()}</p>
				<p class="font-serif text-6xl font-bold capitalize">{monthName(s.bestMonth! + 1)}</p>
				<p class="text-xl">{booksText(s.perMonth[s.bestMonth!]!.books)}</p>
			{:else if current === 'author'}
				<p class="text-lg opacity-80">{m.year_top_author()}</p>
				<p class="font-serif text-5xl font-bold">{s.topAuthors[0]!.name}</p>
				<p class="text-xl">{booksText(s.topAuthors[0]!.count)}</p>
			{:else if current === 'favs'}
				<p class="text-lg opacity-80">{m.year_favourites()}</p>
				<div class="flex -space-x-6">
					{#each s.topRated.slice(0, 5) as b, k (b.workId + k)}<div style="transform: rotate({(k - 2) * 5}deg)"><BookCover src={b.cover ?? null} title={b.title} width={86} /></div>{/each}
				</div>
				<p class="font-serif text-2xl font-bold">{s.topRated[0]!.title}</p>
			{:else if current === 'longest'}
				<p class="text-lg opacity-80">{m.year_longest()}</p>
				<BookCover src={s.longest!.cover ?? null} title={s.longest!.title} width={130} />
				<p class="font-serif text-2xl font-bold">{s.longest!.title}</p>
				<p class="opacity-80">{pagesText(s.longest!.pages ?? 0)}</p>
			{:else if current === 'goal'}
				<p class="text-lg opacity-80">{m.year_goal()}</p>
				<p class="font-serif text-7xl font-bold tabular-nums">{s.books}/{data.goal}</p>
				<p class="text-xl">{s.books >= (data.goal ?? 0) ? m.year_goal_met() : m.year_goal_missed()}</p>
			{:else}
				<p class="font-serif text-4xl font-bold">{m.year_title({ name, year: data.year })}</p>
				<p class="text-xl">{booksText(s.books)} · {pagesText(s.pages)}</p>
				{#if s.avgRating}<p class="opacity-80">{m.year_avg({ stars: s.avgRating })}</p>{/if}
				<div class="flex flex-wrap justify-center gap-2 text-ink">
					{#if data.person.isMe}<ShareButton url={data.og.url} title={m.year_title({ name, year: data.year })} />{/if}
					<a href="/u/{data.person.handle}/stats?year={data.year}" class="btn bg-bg text-ink">{m.year_all_stats()}</a>
				</div>
				{#if data.person.isMe}<p class="max-w-xs text-xs opacity-70">{m.year_share_note()}</p>{/if}
			{/if}
		</section>
	{/key}
</div>

<style>
	.year-slide {
		animation: rise 0.5s ease-out both;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(16px) scale(0.98);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.year-slide {
			animation: none;
		}
	}
</style>
