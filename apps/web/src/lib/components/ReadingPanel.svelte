<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from './Icon.svelte';
	import RatingStars from './RatingStars.svelte';
	import FinishSheet from './FinishSheet.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { daysText, finishedLabel, formatLabelRead, paceLabel, progressText, statusLabel, statusTone, type Status } from '#lib/utils/reading.ts';

	interface Event {
		id: string;
		type: string;
		progress: number | null;
		data: unknown;
		occurredAt: string;
	}
	interface Read {
		id: string;
		format: string;
		outcome: string;
		progress: number | null;
		total: number | null;
		finishedOn: string | null;
		finishedPrecision: string | null;
		rating: number | null;
		review: string;
		pace: string | null;
		durationDaysOverride: number | null;
		estimatedDays?: number | null;
	}

	let {
		title,
		status,
		stuckSource,
		current,
		events,
		past,
		pages,
		medianRate,
		openFinish = false,
		defaultVisibility = 'public'
	}: {
		title: string;
		status: Status | null;
		stuckSource: string | null;
		current: Read | null;
		events: Event[];
		past: Read[];
		pages: number | null;
		medianRate: number | null;
		openFinish?: boolean;
		defaultVisibility?: 'public' | 'followers' | 'friends' | 'private';
	} = $props();

	// svelte-ignore state_referenced_locally
	let finishing = $state(openFinish);
	let finishOutcome = $state<'finished' | 'dnf'>('finished');
	// svelte-ignore state_referenced_locally
	let progressValue = $state<number>(current?.progress ?? 0);
	// svelte-ignore state_referenced_locally
	let total = $state<number | null>(current?.total ?? pages);
	// svelte-ignore state_referenced_locally
	let format = $state(current?.format ?? 'paper');
	let showTimeline = $state(false);
	$effect.pre(() => {
		progressValue = current?.progress ?? 0;
		total = current?.total ?? (current?.format === 'ebook' ? 100 : pages);
		format = current?.format ?? 'paper';
	});
	const startedAt = $derived(events.find((e) => e.type === 'started')?.occurredAt ?? null);
	const max = $derived(format === 'ebook' && !total ? 100 : (total ?? 1000));
	const pct = $derived(total ? Math.round((progressValue / total) * 100) : null);
	const when = (iso: string) => new Date(iso).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
	const eventLabel = (e: Event) =>
		e.type === 'started' ? m.event_started() : e.type === 'progress' ? m.event_progress({ at: progressText(e.progress, current?.total ?? null, current?.format ?? 'paper') })
		: e.type === 'stuck' ? ((e.data as { source?: string } | null)?.source === 'auto' ? m.event_stuck_auto() : m.event_stuck()) : e.type === 'resumed' ? m.event_resumed()
		: e.type === 'finished' ? m.event_finished() : m.event_dnf();
	const choices: Status[] = ['want_to_read', 'reading', 'stuck', 'read', 'dnf'];
</script>

<section class="card space-y-4 p-4" data-testid="reading-panel" data-status={status ?? 'none'}>
	<div class="flex flex-wrap gap-1.5" role="group" aria-label={m.status_label()}>
		{#each choices as s (s)}
			{#if s === 'read' || s === 'dnf'}
				<button type="button" class="rounded-full px-3 py-1.5 text-sm font-semibold {status === s ? statusTone(s) : 'border border-line text-muted'}" onclick={() => ((finishOutcome = s === 'dnf' ? 'dnf' : 'finished'), (finishing = true))} data-set-status={s}>{statusLabel(s)}</button>
			{:else}
				<form method="POST" action="?/status" use:enhance={() => async ({ update }) => update({ reset: false })} class="contents">
					<input type="hidden" name="status" value={status === s ? '' : s} />
					<button class="rounded-full px-3 py-1.5 text-sm font-semibold {status === s ? statusTone(s) : 'border border-line text-muted'}" aria-pressed={status === s} data-set-status={s}>
						{statusLabel(s)}{#if s === 'stuck' && status === 'stuck' && stuckSource === 'auto'} · {m.status_stuck_auto()}{/if}
					</button>
				</form>
			{/if}
		{/each}
	</div>

	{#if current && (status === 'reading' || status === 'stuck')}
		<form method="POST" action="?/progress" use:enhance={() => async ({ update }) => update({ reset: false })} class="space-y-3">
			<input type="hidden" name="readId" value={current.id} />
			<div class="flex items-center gap-2 text-sm">
				<select class="input h-9 w-auto py-0 text-sm" name="format" bind:value={format} aria-label={m.read_format()}>
					<option value="paper">{formatLabelRead('paper')}</option>
					<option value="ebook">{formatLabelRead('ebook')}</option>
					<option value="audiobook">{formatLabelRead('audiobook')}</option>
				</select>
				<span class="flex-1 text-right text-muted">{pct !== null ? `${pct}%` : ''}</span>
			</div>
			<input type="range" min="0" {max} bind:value={progressValue} class="w-full accent-[var(--accent)]" aria-label={m.progress_label()} />
			<div class="flex items-center gap-2">
				<input class="input h-11 w-24 text-center" name="progress" type="number" inputmode="numeric" min="0" {max} bind:value={progressValue} aria-label={m.progress_label()} />
				<span class="text-sm text-muted">{format === 'audiobook' ? m.progress_minutes_of() : format === 'ebook' && total === 100 ? '%' : m.progress_of()}</span>
				{#if !(format === 'ebook' && total === 100)}
					<input class="input h-11 w-24 text-center" name="total" type="number" inputmode="numeric" min="1" bind:value={total} aria-label={m.progress_total()} />
				{:else}<input type="hidden" name="total" value="100" />{/if}
				<button class="btn btn-primary h-11 flex-1 px-3 text-sm" data-testid="progress-save">{m.progress_save()}</button>
			</div>
		</form>
		<button class="text-sm font-medium text-accent" onclick={() => (showTimeline = !showTimeline)} aria-expanded={showTimeline}>{m.timeline_title()} ({events.length})</button>
		{#if showTimeline}
			<ol class="space-y-1.5 border-l-2 border-line pl-4 text-sm" data-testid="timeline">
				{#each events as e (e.id)}<li><span class="text-muted">{when(e.occurredAt)}</span> · {eventLabel(e)}</li>{/each}
			</ol>
		{/if}
	{/if}

	{#if past.length}
		<div>
			<p class="section-title">{m.reads_history()}</p>
			<ul class="divide-y divide-line/60">
				{#each past as r, i (r.id)}
					<li>
						<a href="/read/{r.id}" class="flex items-center gap-2 py-2 text-sm" data-read={r.id}>
							{#if past.length - i > 1}<span title={m.log_reread()}>↻</span>{/if}
							<span class="flex-1">{r.outcome === 'dnf' ? `${m.status_dnf()} · ` : ''}{finishedLabel(r.finishedOn, r.finishedPrecision)}</span>
							{#if r.durationDaysOverride ?? r.estimatedDays}<span class="text-muted" data-testid="duration">{m.log_days({ days: daysText((r.durationDaysOverride ?? r.estimatedDays)!) })}</span>{/if}
							{#if r.pace}<span class="text-muted">· {paceLabel(r.pace)}</span>{/if}
							<RatingStars value={r.rating} />
							<Icon name="forward" size={14} class="text-muted" />
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>

{#if finishing}
<FinishSheet
	bind:open={finishing}
	action="?/finish"
	{title}
	{startedAt}
	pages={current?.total ?? pages}
	{medianRate}
	initial={{ outcome: finishOutcome, date: null, precision: 'day', rating: null, review: '', reviewSpoiler: false, durationDaysOverride: null, pace: null, visibility: defaultVisibility }}
/>
{/if}
