<script lang="ts">
	import FinishSheet from '#lib/components/FinishSheet.svelte';
	import RatingStars from '#lib/components/RatingStars.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { daysText, finishedLabel, formatLabelRead, paceLabel, statusLabel } from '#lib/utils/reading.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const r = $derived(data.read);
	let editing = $state(false);
	let confirmDelete = $state(false);
	let showSpoiler = $state(false);
	const days = $derived(r.durationDaysOverride ?? data.estimatedDays);
	const startedAt = $derived(data.events.find((e) => e.type === 'started')?.occurredAt ?? null);
	const when = (iso: string) => new Date(iso).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<svelte:head><title>{data.work.title} · {m.log_title()} · bok</title></svelte:head>

<TopBar title={data.work.title} back={data.mine ? '/log' : `/u/${data.owner?.handle}`}>
	{#snippet actions()}
		{#if data.mine}<button class="btn btn-ghost h-10 px-3 text-sm" onclick={() => (editing = true)} data-testid="edit-read">{m.book_edit()}</button>{/if}
	{/snippet}
</TopBar>
<main class="page space-y-4">
	{#if form?.saved}<p class="rounded-xl bg-accent-soft px-4 py-2 text-sm" role="status">{m.common_saved()}</p>{/if}
	<section class="card space-y-3 p-4">
		{#if !data.mine && data.owner}<p class="text-sm text-muted"><a href="/u/{data.owner.handle}" class="font-semibold text-ink">{data.owner.displayName}</a> · @{data.owner.handle}</p>{/if}
		<a href="/book/{data.work.id}" class="font-serif text-xl font-bold text-accent">{data.work.title}</a>
		<p class="text-sm" data-testid="read-when">{r.outcome === 'dnf' ? `${statusLabel('dnf')} · ` : ''}{finishedLabel(r.finishedOn, r.finishedPrecision)}</p>
		{#if r.rating !== null}<p class="flex items-center gap-2"><RatingStars value={r.rating} size={20} /><span class="text-sm text-muted">{r.rating}/10</span></p>{/if}
		<dl class="grid grid-cols-3 gap-2 text-center text-sm">
			<div class="rounded-xl bg-bg p-2"><dt class="text-xs text-muted">{m.finish_reading_time()}</dt><dd class="font-semibold" data-testid="read-days">{days ? m.log_days({ days: daysText(days) }) : '—'}</dd>{#if r.durationDaysOverride && data.estimatedDays && r.durationDaysOverride !== data.estimatedDays}<dd class="text-[11px] text-muted">{m.read_estimated({ days: daysText(data.estimatedDays) })}</dd>{/if}</div>
			<div class="rounded-xl bg-bg p-2"><dt class="text-xs text-muted">{m.finish_pace()}</dt><dd class="font-semibold">{paceLabel(r.pace ?? data.suggestedPace) || '—'}</dd></div>
			<div class="rounded-xl bg-bg p-2"><dt class="text-xs text-muted">{m.read_format()}</dt><dd class="font-semibold">{formatLabelRead(r.format)}</dd></div>
		</dl>
		{#if r.review}
			{#if r.reviewSpoiler && !showSpoiler}
				<button class="w-full rounded-xl bg-bg p-4 text-sm text-muted" onclick={() => (showSpoiler = true)}>{m.spoiler_show()}</button>
			{:else}
				<p class="leading-relaxed whitespace-pre-line">{r.review}</p>
			{/if}
		{/if}
		<p class="text-xs text-muted {data.mine ? '' : 'hidden'}">{m.finish_visibility()}: {r.visibility === 'public' ? m.visibility_public() : r.visibility === 'followers' ? m.visibility_followers() : r.visibility === 'friends' ? m.visibility_friends() : m.visibility_private()}</p>
	</section>

	{#if data.events.length}
		<section>
			<h2 class="section-title">{m.timeline_title()}</h2>
			<ol class="card space-y-1.5 p-4 text-sm">
				{#each data.events as e (e.id)}
					<li><span class="text-muted">{when(e.occurredAt)}</span> · {e.type === 'started' ? m.event_started() : e.type === 'progress' ? m.event_progress({ at: String(e.progress ?? '') }) : e.type === 'stuck' ? m.event_stuck() : e.type === 'resumed' ? m.event_resumed() : e.type === 'finished' ? m.event_finished() : m.event_dnf()}</li>
				{/each}
			</ol>
		</section>
	{/if}

	{#if confirmDelete}
		<form method="POST" action="?/delete" class="card space-y-3 border-danger/40 p-4">
			<p class="text-sm">{m.read_delete_confirm()}</p>
			<div class="flex gap-2"><button class="btn btn-danger flex-1">{m.shelves_delete()}</button><button type="button" class="btn btn-secondary" onclick={() => (confirmDelete = false)}>{m.common_cancel()}</button></div>
		</form>
	{/if}
</main>

{#if editing}
	<FinishSheet
		bind:open={editing}
		action="?/save"
		title={data.work.title}
		editing
		{startedAt}
		pages={r.format === 'paper' ? r.total : null}
		medianRate={data.medianRate}
		initial={{ outcome: r.outcome === 'dnf' ? 'dnf' : 'finished', date: r.finishedOn, precision: r.finishedPrecision, rating: r.rating, review: r.review, reviewSpoiler: r.reviewSpoiler, durationDaysOverride: r.durationDaysOverride, pace: r.pace, visibility: r.visibility }}
		ondelete={() => ((editing = false), (confirmDelete = true))}
	/>
{/if}
