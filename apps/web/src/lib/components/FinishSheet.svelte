<script lang="ts">
	import { enhance } from '$app/forms';
	import { estimateDays, suggestPace } from '@bok/core';
	import Icon from './Icon.svelte';
	import RatingInput from './RatingInput.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { daysText, paceLabel } from '#lib/utils/reading.ts';
	import { todayLocal } from '#lib/utils/loans.ts';

	export interface FinishValues {
		outcome: 'finished' | 'dnf';
		date: string | null;
		precision: 'day' | 'month' | 'year' | null;
		rating: number | null;
		review: string;
		reviewSpoiler: boolean;
		durationDaysOverride: number | null;
		pace: 'intensive' | 'usual' | 'slow' | null;
		visibility: 'public' | 'followers' | 'friends' | 'private';
	}

	let {
		open = $bindable(false),
		action,
		title,
		initial,
		startedAt = null,
		pages = null,
		medianRate = null,
		editing = false,
		ondelete
	}: {
		open?: boolean;
		action: string;
		title: string;
		initial: FinishValues;
		startedAt?: string | null;
		pages?: number | null;
		medianRate?: number | null;
		editing?: boolean;
		ondelete?: () => void;
	} = $props();

	const todayIso = todayLocal(); // the device's calendar day, not UTC
	// svelte-ignore state_referenced_locally
	let outcome = $state(initial.outcome);
	// svelte-ignore state_referenced_locally
	let precision = $state<'day' | 'month' | 'year' | 'none'>(initial.precision ?? (editing ? 'none' : 'day'));
	// svelte-ignore state_referenced_locally
	let day = $state(initial.precision === 'day' && initial.date ? initial.date : todayIso);
	// svelte-ignore state_referenced_locally
	let month = $state(initial.date ? initial.date.slice(0, 7) : todayIso.slice(0, 7));
	// svelte-ignore state_referenced_locally
	let year = $state(initial.date ? initial.date.slice(0, 4) : todayIso.slice(0, 4));
	// svelte-ignore state_referenced_locally
	let rating = $state<number | null>(initial.rating);
	// svelte-ignore state_referenced_locally
	let override = $state<string>(initial.durationDaysOverride ? String(initial.durationDaysOverride) : '');
	// svelte-ignore state_referenced_locally
	let pace = $state(initial.pace);
	let busy = $state(false);

	const dateValue = $derived(precision === 'day' ? day : precision === 'month' ? month : precision === 'year' ? year : '');
	const estimate = $derived(startedAt ? estimateDays(startedAt, precision === 'day' ? day : todayIso) : null);
	const days = $derived(override ? Number(override) : estimate);
	const suggested = $derived(suggestPace(pages, days, medianRate));
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex flex-col bg-black/40" role="dialog" aria-modal="true" aria-label={title}>
		<button class="h-10 shrink-0" aria-label={m.common_close()} onclick={() => (open = false)}></button>
		<form
			method="POST"
			{action}
			class="flex min-h-0 flex-1 flex-col rounded-t-2xl bg-bg"
			use:enhance={() => {
				busy = true;
				return async ({ update, result }) => {
					await update({ reset: false });
					busy = false;
					if (result.type === 'success' || result.type === 'redirect') open = false;
				};
			}}
		>
			<div class="flex items-center gap-2 border-b border-line px-4 py-3">
				<h2 class="flex-1 truncate font-serif text-lg font-bold">{title}</h2>
				<button type="button" class="grid size-10 place-items-center rounded-full hover:bg-line/50" onclick={() => (open = false)} aria-label={m.common_close()}><Icon name="x" /></button>
			</div>
			<div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
				{#if !editing}
					<div class="grid grid-cols-2 rounded-xl bg-line/50 p-1 text-sm font-semibold">
						<button type="button" class="rounded-lg py-2 {outcome === 'finished' ? 'bg-surface shadow-sm' : 'text-muted'}" onclick={() => (outcome = 'finished')}>{m.finish_finished()}</button>
						<button type="button" class="rounded-lg py-2 {outcome === 'dnf' ? 'bg-surface shadow-sm' : 'text-muted'}" onclick={() => (outcome = 'dnf')}>{m.finish_dnf()}</button>
					</div>
				{/if}
				<input type="hidden" name="outcome" value={outcome} />

				<fieldset>
					<legend class="label">{m.finish_when()}</legend>
					<div class="mb-2 flex flex-wrap gap-1.5 text-sm">
						{#each [['day', m.finish_on_day()], ['month', m.finish_in_month()], ['year', m.finish_in_year()], ['none', m.finish_no_date()]] as [p, l] (p)}
							<button type="button" class="rounded-lg border px-3 py-1.5 {precision === p ? 'border-accent bg-accent text-accent-ink' : 'border-line'}" onclick={() => (precision = p as typeof precision)} data-precision={p}>{l}</button>
						{/each}
					</div>
					{#if precision === 'day'}<input class="input" type="date" bind:value={day} max={todayIso} aria-label={m.finish_on_day()} />
					{:else if precision === 'month'}<input class="input" type="month" bind:value={month} aria-label={m.finish_in_month()} />
					{:else if precision === 'year'}<input class="input" type="number" inputmode="numeric" min="1900" max={todayIso.slice(0, 4)} bind:value={year} aria-label={m.finish_in_year()} />
					{:else}<p class="text-sm text-muted">{m.finish_no_date_hint()}</p>{/if}
					<input type="hidden" name="precision" value={precision === 'none' ? '' : precision} />
					<input type="hidden" name="date" value={dateValue} />
				</fieldset>

				{#if outcome === 'finished'}
					<div>
						<p class="label">{m.rating_label()}</p>
						<RatingInput bind:value={rating} />
					</div>
				{/if}

				<div>
					<label class="label" for="review">{outcome === 'finished' ? m.finish_review() : m.finish_dnf_note()}</label>
					<textarea class="input" id="review" name="review" rows="4" maxlength="20000" defaultValue={initial.review} placeholder={m.finish_review_placeholder()}></textarea>
					<label class="mt-2 flex items-center gap-2 text-sm">
						<input type="checkbox" name="reviewSpoiler" checked={initial.reviewSpoiler} class="size-5 rounded border-line text-accent focus:ring-accent" />
						{m.finish_spoiler()}
					</label>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="label" for="duration">{m.finish_reading_time()}</label>
						<input class="input" id="duration" name="durationDaysOverride" type="number" inputmode="numeric" min="1" max="10000" bind:value={override} placeholder={estimate ? String(estimate) : '—'} />
						<p class="mt-1 text-xs text-muted" data-testid="estimate">{estimate ? m.finish_estimate({ days: daysText(estimate) }) : m.finish_no_estimate()}</p>
					</div>
					<div>
						<label class="label" for="visibility">{m.finish_visibility()}</label>
						<select class="input" id="visibility" name="visibility" value={initial.visibility}>
							<option value="public">{m.visibility_public()}</option>
							<option value="followers">{m.visibility_followers()}</option>
							<option value="friends">{m.visibility_friends()}</option>
							<option value="private">{m.visibility_private()}</option>
						</select>
					</div>
				</div>

				<fieldset>
					<legend class="label">{m.finish_pace()}</legend>
					<div class="flex flex-wrap gap-1.5 text-sm">
						{#each ['intensive', 'usual', 'slow'] as p (p)}
							<button type="button" class="relative rounded-lg border px-3 py-1.5 {pace === p ? 'border-accent bg-accent text-accent-ink' : 'border-line'}" onclick={() => (pace = pace === p ? null : (p as typeof pace))} data-pace={p}>
								{paceLabel(p)}{#if suggested === p && pace !== p}<span class="ml-1 text-xs text-accent">· {m.finish_suggested()}</span>{/if}
							</button>
						{/each}
					</div>
					<input type="hidden" name="pace" value={pace ?? suggested ?? ''} />
					{#if !pace && suggested}<p class="mt-1 text-xs text-muted">{m.finish_pace_auto({ pace: paceLabel(suggested) })}</p>{/if}
				</fieldset>
			</div>
			<div class="flex gap-2 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
				{#if ondelete}<button type="button" class="btn btn-ghost text-danger" onclick={ondelete}>{m.shelves_delete()}</button>{/if}
				<button class="btn btn-primary flex-1" disabled={busy} data-testid="finish-save">{editing ? m.common_save() : outcome === 'finished' ? m.finish_save() : m.finish_save_dnf()}</button>
			</div>
		</form>
	</div>
{/if}
