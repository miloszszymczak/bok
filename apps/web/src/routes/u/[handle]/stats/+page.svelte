<script lang="ts">
	import TopBar from '#lib/components/TopBar.svelte';
	import BookCover from '#lib/components/BookCover.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { booksText, daysText, monthName } from '#lib/utils/reading.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = $derived(data.stats);
	const years = $derived(s.perYear.map((y) => y.year).reverse());
	const maxYear = $derived(Math.max(1, ...s.perYear.map((y) => y.books)));
	const maxMonth = $derived(Math.max(1, ...s.perMonth.map((x) => x.books)));
	const maxRating = $derived(Math.max(1, ...s.ratings));
	const fmt = (n: number) => n.toLocaleString();
	const paceTotal = $derived(Math.max(1, s.pace.intensive + s.pace.usual + s.pace.slow));
	const formatTotal = $derived(Math.max(1, s.formats.paper + s.formats.ebook + s.formats.audiobook));
</script>

<svelte:head><title>{m.stats_title()} · {data.person.displayName} · bok</title><meta name="robots" content="noindex" /></svelte:head>

<TopBar title={m.stats_title()} back="/u/{data.person.handle}?tab=stats" />
<main class="page space-y-6" data-testid="stats">
	<nav class="-mx-4 flex gap-1.5 overflow-x-auto px-4 text-sm" aria-label={m.stats_years()}>
		<a href="?" data-sveltekit-replacestate class="shrink-0 rounded-full border px-3 py-1 {data.year === null ? 'border-accent bg-accent text-accent-ink' : 'border-line'}">{m.stats_all_time()}</a>
		{#each years as y (y)}<a href="?year={y}" data-sveltekit-replacestate class="shrink-0 rounded-full border px-3 py-1 {data.year === y ? 'border-accent bg-accent text-accent-ink' : 'border-line'}">{y}</a>{/each}
	</nav>

	<div class="grid grid-cols-2 gap-3">
		<div class="card p-4"><p class="text-xs text-muted">{m.stats_books()}</p><p class="font-serif text-3xl font-bold" data-testid="stat-books">{fmt(s.books)}</p></div>
		<div class="card p-4"><p class="text-xs text-muted">{m.stats_pages_total()}</p><p class="font-serif text-3xl font-bold" data-testid="stat-pages">{fmt(s.pages)}</p></div>
		<div class="card p-4"><p class="text-xs text-muted">{m.stats_avg_rating()}</p><p class="font-serif text-3xl font-bold">{s.avgRating ?? '–'}{#if s.avgRating}<span class="text-lg">★</span>{/if}</p></div>
		<div class="card p-4"><p class="text-xs text-muted">{m.stats_avg_time()}</p><p class="font-serif text-3xl font-bold">{s.avgDays ? daysText(s.avgDays) : '–'}</p></div>
	</div>

	{#if data.year === null && s.perYear.length}
		<section>
			<h2 class="section-title">{m.stats_per_year()}</h2>
			<ul class="card space-y-2 p-4" data-testid="per-year">
				{#each [...s.perYear].reverse() as y (y.year)}
					<li><a href="?year={y.year}" class="flex items-center gap-3 text-sm"><span class="w-12 shrink-0 tabular-nums">{y.year}</span><span class="h-5 rounded bg-accent" style="width: {(y.books / maxYear) * 70}%"></span><span class="shrink-0 tabular-nums text-muted">{y.books}</span></a></li>
				{/each}
			</ul>
		</section>
	{:else if data.year !== null}
		<section>
			<h2 class="section-title">{m.stats_per_month()}</h2>
			<div class="card flex h-40 items-end gap-1 p-4" data-testid="per-month">
				{#each s.perMonth as mo, i (i)}
					<div class="flex h-full flex-1 flex-col items-center justify-end gap-1" title="{monthName(i + 1)}: {mo.books}">
						<span class="text-[10px] text-muted tabular-nums">{mo.books || ''}</span>
						<div class="w-full rounded-t bg-accent" style="height: {(mo.books / maxMonth) * 80}%"></div>
						<span class="text-[10px] text-muted">{monthName(i + 1).slice(0, 3)}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section>
		<h2 class="section-title">{m.stats_ratings()}</h2>
		<div class="card flex h-32 items-end gap-1 p-4" data-testid="ratings">
			{#each s.ratings as n, i (i)}
				<div class="flex h-full flex-1 flex-col items-center justify-end gap-1"><div class="w-full rounded-t bg-warn/80" style="height: {(n / maxRating) * 80}%"></div><span class="text-[10px] text-muted">{(i + 1) / 2}</span></div>
			{/each}
		</div>
	</section>

	<div class="grid gap-3 sm:grid-cols-2">
		<section class="card p-4">
			<h2 class="mb-2 text-sm font-semibold">{m.stats_formats()}</h2>
			{#each [['paper', m.read_format_paper()], ['ebook', m.format_ebook()], ['audiobook', m.format_audiobook()]] as [k, label] (k)}
				{@const n = s.formats[k as 'paper']}
				<p class="flex justify-between text-sm"><span>{label}</span><span class="text-muted tabular-nums">{n} · {Math.round((n / formatTotal) * 100)}%</span></p>
			{/each}
		</section>
		<section class="card p-4">
			<h2 class="mb-2 text-sm font-semibold">{m.stats_pace()}</h2>
			{#each [['intensive', m.pace_intensive()], ['usual', m.pace_usual()], ['slow', m.pace_slow()]] as [k, label] (k)}
				{@const n = s.pace[k as 'usual']}
				<p class="flex justify-between text-sm"><span>{label}</span><span class="text-muted tabular-nums">{n} · {Math.round((n / paceTotal) * 100)}%</span></p>
			{/each}
		</section>
		<section class="card p-4">
			<h2 class="mb-2 text-sm font-semibold">{m.stats_top_authors()}</h2>
			{#each s.topAuthors as a (a.name)}<p class="flex justify-between text-sm"><span class="truncate">{a.name}</span><span class="text-muted">{a.count}</span></p>{:else}<p class="text-sm text-muted">–</p>{/each}
		</section>
		<section class="card p-4">
			<h2 class="mb-2 text-sm font-semibold">{m.stats_top_tags()}</h2>
			{#each s.topTags as t (t.name)}<p class="flex justify-between text-sm"><span class="truncate">#{t.name}</span><span class="text-muted">{t.count}</span></p>{:else}<p class="text-sm text-muted">–</p>{/each}
		</section>
	</div>

	{#if s.longest || s.fastest}
		<section class="grid grid-cols-3 gap-3">
			{#each [[m.stats_longest(), s.longest, s.longest ? m.stats_n_pages({ n: s.longest.pages ?? 0 }) : ''], [m.stats_shortest(), s.shortest, s.shortest ? m.stats_n_pages({ n: s.shortest.pages ?? 0 }) : ''], [m.stats_fastest(), s.fastest, s.fastest ? daysText(s.fastest.days ?? 0) : '']] as [label, b, meta] (label)}
				{#if b && typeof b === 'object'}
					<a href="/book/{b.workId}" class="min-w-0"><p class="mb-1 text-xs text-muted">{label}</p><BookCover src={b.cover ?? null} title={b.title} width={96} /><p class="mt-1 line-clamp-2 text-xs font-medium">{b.title}</p><p class="text-xs text-muted">{meta}</p></a>
				{/if}
			{/each}
		</section>
	{/if}
	{#if s.dnf}<p class="text-center text-xs text-muted">{m.stats_dnf({ books: booksText(s.dnf) })}</p>{/if}
	{#if data.year !== null}<a href="/u/{data.person.handle}/year/{data.year}" class="btn btn-secondary w-full" data-testid="year-link">{m.year_open({ year: data.year })}</a>{/if}
</main>
