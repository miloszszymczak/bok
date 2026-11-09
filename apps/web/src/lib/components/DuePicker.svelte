<script lang="ts">
	import { dueFor } from '@bok/core';
	import { m } from '#lib/paraglide/messages.js';
	import { shortDate, todayLocal } from '#lib/utils/loans.ts';

	/** Due date: 2 weeks / 1 month / a chosen date / none. `value` is an ISO day or null. */
	let { value = $bindable<string | null>(null), allowNone = true }: { value?: string | null; allowNone?: boolean } = $props();
	const today = todayLocal();
	let choice = $state<'2w' | '1m' | 'custom' | 'none'>('2w');
	let custom = $state(dueFor('1m', today));
	$effect(() => {
		value = choice === 'none' ? null : choice === 'custom' ? custom || null : dueFor(choice, today);
	});
	const opts = $derived([
		['2w', m.loan_due_2w()],
		['1m', m.loan_due_1m()],
		['custom', m.loan_due_custom()],
		...(allowNone ? [['none', m.loan_due_none()]] : [])
	] as [typeof choice, string][]);
</script>

<fieldset class="space-y-2" data-testid="due-picker">
	<legend class="mb-1 text-sm font-semibold">{m.loan_due_label()}</legend>
	<div class="flex flex-wrap gap-1.5">
		{#each opts as [id, label] (id)}
			<label class="cursor-pointer rounded-full border px-3 py-1.5 text-sm {choice === id ? 'border-accent bg-accent text-accent-ink' : 'border-line'}">
				<input type="radio" class="sr-only" bind:group={choice} value={id} data-due={id} />{label}
			</label>
		{/each}
	</div>
	{#if choice === 'custom'}
		<input type="date" class="input h-11" bind:value={custom} min={today} aria-label={m.loan_due_custom()} data-testid="due-date" />
	{:else if value}
		<p class="text-xs text-muted">{m.loan_until({ date: shortDate(value) })}</p>
	{/if}
</fieldset>
