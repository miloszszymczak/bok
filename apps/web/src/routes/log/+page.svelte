<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { groupLog } from '@bok/core';
	import BookCover from '#lib/components/BookCover.svelte';
	import RatingStars from '#lib/components/RatingStars.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { formatLabelRead, monthName } from '#lib/utils/reading.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const groups = $derived(groupLog(data.entries));
	let editingGoal = $state(false);
	const g = $derived(data.goal);

	function setFilter(key: string, value: string) {
		const u = new URLSearchParams();
		const f = { ...data.filters, [key]: value || null } as Record<string, string | number | null>;
		for (const [k, v] of Object.entries(f)) if (v !== null && v !== '') u.set(k, String(v));
		void goto(`/log${u.size ? `?${u}` : ''}`, { replaceState: true });
	}
</script>

<svelte:head><title>{m.log_title()} · bok</title></svelte:head>

<TopBar title={m.log_title()} back="/u/{data.profile?.handle}" />
<main class="page space-y-5">
	<section class="card p-4" data-testid="goal">
		{#if g.target && g.progress && !editingGoal}
			<div class="flex items-baseline justify-between">
				<p class="font-semibold">{m.goal_title({ year: g.year })}</p>
				<button class="text-sm text-accent" onclick={() => (editingGoal = true)}>{m.book_edit()}</button>
			</div>
			<p class="mt-1 font-serif text-3xl font-bold"><span data-testid="goal-done">{g.done}</span> <span class="text-lg text-muted">/ {g.target}</span></p>
			<div class="relative mt-3 h-2.5 overflow-hidden rounded-full bg-line">
				<div class="h-full rounded-full bg-accent" style="width:{g.progress.percent}%"></div>
				<div class="absolute inset-y-0 w-0.5 bg-ink/50" style="left:{Math.min(100, (g.progress.expected / g.target) * 100)}%" title={m.goal_expected({ n: g.progress.expected })}></div>
			</div>
			<p class="mt-2 text-sm {g.progress.diff < 0 ? 'text-warn' : 'text-accent'}" data-testid="goal-status">
				{g.done >= g.target ? m.goal_done() : g.progress.diff === 0 ? m.goal_on_track() : g.progress.diff > 0 ? m.goal_ahead({ n: g.progress.diff }) : m.goal_behind({ n: -g.progress.diff })}
			</p>
		{:else}
			<form method="POST" action="?/goal" use:enhance={() => async ({ update }) => { await update({ reset: false }); editingGoal = false; }} class="space-y-2">
				<label class="label" for="target">{m.goal_set({ year: g.year })}</label>
				<input type="hidden" name="year" value={g.year} />
				<div class="flex gap-2">
					<input class="input h-11 w-28" id="target" name="target" type="number" inputmode="numeric" min="1" max="1000" defaultValue={g.target ?? 24} />
					<button class="btn btn-primary h-11 flex-1">{m.common_save()}</button>
					{#if g.target}<button class="btn btn-ghost h-11" name="target" value="">{m.goal_remove()}</button>{/if}
				</div>
			</form>
		{/if}
	</section>

	<div class="-mx-4 flex gap-2 overflow-x-auto px-4 text-sm">
		<select class="input h-9 w-auto shrink-0 py-0 text-sm" value={data.filters.year ?? ''} onchange={(e) => setFilter('year', e.currentTarget.value)} aria-label={m.log_filter_year()}>
			<option value="">{m.log_all_years()}</option>
			{#each data.years as y (y)}<option value={y}>{y}</option>{/each}
		</select>
		<select class="input h-9 w-auto shrink-0 py-0 text-sm" value={data.filters.rating ?? ''} onchange={(e) => setFilter('rating', e.currentTarget.value)} aria-label={m.log_filter_rating()}>
			<option value="">{m.log_any_rating()}</option>
			{#each [10, 8, 6, 4] as r (r)}<option value={r}>{m.log_rating_at_least({ stars: r / 2 })}</option>{/each}
		</select>
		<select class="input h-9 w-auto shrink-0 py-0 text-sm" value={data.filters.format ?? ''} onchange={(e) => setFilter('format', e.currentTarget.value)} aria-label={m.read_format()}>
			<option value="">{m.log_any_format()}</option>
			{#each ['paper', 'ebook', 'audiobook'] as f (f)}<option value={f}>{formatLabelRead(f)}</option>{/each}
		</select>
		{#if data.myTags.length}
			<select class="input h-9 w-auto shrink-0 py-0 text-sm" value={data.filters.tag ?? ''} onchange={(e) => setFilter('tag', e.currentTarget.value)} aria-label={m.tags_title()}>
				<option value="">{m.log_any_tag()}</option>
				{#each data.myTags as t (t.slug)}<option value={t.slug}>#{t.name}</option>{/each}
			</select>
		{/if}
	</div>

	{#each groups as grp (grp.year ?? 'past')}
		<section data-log-year={grp.year ?? 'past'}>
			<h2 class="mb-2 px-1 font-serif text-2xl font-bold">{grp.year ?? m.log_past()}</h2>
			{#each grp.months as mo (mo.month ?? 'none')}
				{#if grp.year !== null}<h3 class="section-title mt-3" data-log-month={mo.month ?? 'none'}>{mo.month ? monthName(mo.month) : m.log_sometime({ year: grp.year })}</h3>{/if}
				<ul class="card divide-y divide-line/60">
					{#each mo.entries as e (e.id)}
						<li>
							<a href="/read/{e.id}" class="flex items-center gap-3 p-2.5" data-entry={e.title}>
								<span class="w-7 shrink-0 text-center font-serif text-lg font-bold text-muted">{e.finishedPrecision === 'day' && e.finishedOn ? Number(e.finishedOn.slice(8, 10)) : ''}</span>
								<BookCover src={e.cover} title={e.title} width={36} />
								<span class="min-w-0 flex-1">
									<span class="block truncate font-medium">{e.readNumber > 1 ? '↻ ' : ''}{e.title}</span>
									<span class="block truncate text-xs text-muted">{e.authors.join(', ')}</span>
								</span>
								<span class="flex shrink-0 flex-col items-end gap-0.5">
									<RatingStars value={e.rating} />
									{#if e.hasReview}<span class="text-[11px] text-muted">{m.log_has_review()}</span>{/if}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{/each}
		</section>
	{:else}
		<p class="card p-6 text-center text-sm text-muted">{m.log_empty()}</p>
	{/each}
</main>
