<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import BookCover from './BookCover.svelte';
	import DuePicker from './DuePicker.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { dueText, isOverdue, shortDate, todayLocal } from '#lib/utils/loans.ts';
	import { addDays } from '@bok/core';
	import type { LoanView } from '@bok/server';

	let { loan }: { loan: LoanView } = $props();
	let busy = $state(false);
	let failed = $state(false);
	let approving = $state(false);
	let dueOn = $state<string | null>(null);
	let extending = $state(false);
	let extendTo = $state('');

	const otherIsUser = $derived(!!loan.other.userId);
	const name = $derived(loan.other.name);
	const lenderOutside = $derived(loan.role === 'borrower' && !otherIsUser);
	/** I can change the date myself: I'm the lender, or the lender isn't on bok. */
	const ownsDate = $derived(loan.role === 'lender' || lenderOutside);

	async function act(action: string, extra: Record<string, unknown> = {}) {
		busy = true;
		failed = false;
		const r = await fetch(`/api/v1/loans/${loan.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
		busy = false;
		if (!r.ok) failed = true;
		approving = extending = false;
		await invalidateAll();
	}
	function startExtend() {
		extending = true;
		extendTo = addDays(loan.dueOn ?? todayLocal(), 14);
	}
</script>

<article class="card p-3" id="loan-{loan.id}" data-loan={loan.id} data-status={loan.status} data-role={loan.role}>
	<div class="flex gap-3">
		<a href="/book/{loan.work.id}{loan.editionId ? `?e=${loan.editionId}` : ''}" class="shrink-0" aria-label={loan.work.title}><BookCover src={loan.work.cover} title={loan.work.title} author={loan.work.authors[0]} width={48} /></a>
		<div class="min-w-0 flex-1">
			<a href="/book/{loan.work.id}" class="line-clamp-2 font-medium">{loan.work.title}</a>
			<p class="truncate text-sm text-muted">
				{#if loan.role === 'lender'}{m.loan_to()}{:else}{m.loan_from()}{/if}
				{#if loan.other.handle}<a href="/u/{loan.other.handle}" class="font-medium text-ink">{name}</a>{:else}<span class="font-medium text-ink">{name}</span>{/if}
			</p>
			{#if loan.status === 'active'}
				<p class="text-sm font-semibold {isOverdue(loan.dueOn) ? 'text-danger' : 'text-ink'}" data-testid="due-text">{dueText(loan.dueOn)}{#if loan.dueOn}<span class="font-normal text-muted">{` · ${shortDate(loan.dueOn)}`}</span>{/if}</p>
			{:else if loan.status === 'returned'}
				<p class="text-xs text-muted">{m.loan_returned_on({ from: loan.lentOn ? shortDate(loan.lentOn) : '—', to: loan.returnedOn ? shortDate(loan.returnedOn) : '—' })}</p>
			{:else if loan.status === 'requested' && loan.role === 'lender'}
				<p class="text-sm">{m.loan_wants({ name })}</p>
			{:else if loan.status === 'requested'}
				<p class="text-sm text-muted">{m.loan_waiting({ name })}</p>
			{/if}
			{#if loan.note}<p class="mt-1 text-sm text-muted italic">“{loan.note}”</p>{/if}
		</div>
	</div>

	{#if loan.status === 'requested' && loan.role === 'lender'}
		{#if approving}
			<div class="mt-3 space-y-3 border-t border-line/60 pt-3">
				<DuePicker bind:value={dueOn} />
				<div class="flex gap-2"><button class="btn btn-primary flex-1" disabled={busy} onclick={() => act('approve', { dueOn })} data-testid="loan-approve-confirm">{m.loan_approve()}</button><button class="btn btn-secondary" onclick={() => (approving = false)}>{m.common_cancel()}</button></div>
			</div>
		{:else}
			<div class="mt-3 flex gap-2"><button class="btn btn-primary h-10 flex-1 text-sm" onclick={() => (approving = true)} data-testid="loan-approve">{m.loan_approve()}</button><button class="btn btn-secondary h-10 text-sm" disabled={busy} onclick={() => act('decline')} data-testid="loan-decline">{m.loan_decline()}</button></div>
		{/if}
	{:else if loan.status === 'requested'}
		<div class="mt-3"><button class="btn btn-secondary h-10 text-sm" disabled={busy} onclick={() => act('cancel')} data-testid="loan-cancel">{m.loan_cancel_request()}</button></div>
	{:else if loan.status === 'active'}
		{#if loan.role === 'lender' && loan.extensionTo}
			<div class="mt-3 rounded-xl bg-accent-soft p-3 text-sm" data-testid="extension-request">
				<p>{m.loan_extension_asks({ name, date: shortDate(loan.extensionTo) })}</p>
				<div class="mt-2 flex gap-2"><button class="btn btn-primary h-9 flex-1 text-sm" disabled={busy} onclick={() => act('extension', { approve: true })} data-testid="extension-approve">{m.loan_extension_approve()}</button><button class="btn btn-secondary h-9 text-sm" disabled={busy} onclick={() => act('extension', { approve: false })}>{m.loan_decline()}</button></div>
			</div>
		{/if}
		{#if loan.role === 'lender' && loan.returnMarked}
			<div class="mt-3 rounded-xl bg-accent-soft p-3 text-sm" data-testid="return-claim">
				<p>{m.loan_return_claimed({ name })}</p>
				<div class="mt-2 flex gap-2"><button class="btn btn-primary h-9 flex-1 text-sm" disabled={busy} onclick={() => act('returned')} data-testid="loan-confirm-return">{m.loan_confirm_return()}</button><button class="btn btn-secondary h-9 text-sm" disabled={busy} onclick={() => act('dispute')}>{m.loan_not_yet()}</button></div>
			</div>
		{:else if loan.role === 'borrower' && loan.returnMarked}
			<p class="mt-3 text-sm text-muted">{m.loan_return_pending({ name })}</p>
		{:else if loan.role === 'borrower' && loan.extensionTo}
			<p class="mt-3 text-sm text-muted">{m.loan_extension_pending({ date: shortDate(loan.extensionTo) })}</p>
		{/if}

		{#if extending}
			<div class="mt-3 flex gap-2 border-t border-line/60 pt-3">
				<input type="date" class="input h-10 flex-1" bind:value={extendTo} min={loan.dueOn ? addDays(loan.dueOn, 1) : todayLocal()} aria-label={m.loan_new_date()} data-testid="extend-date" />
				<button class="btn btn-primary h-10 text-sm" disabled={busy || !extendTo} onclick={() => (ownsDate ? act('edit', { dueOn: extendTo }) : act('extend', { to: extendTo }))} data-testid="extend-send">{ownsDate ? m.common_save() : m.loan_ask()}</button>
			</div>
		{:else if !loan.returnMarked}
			<div class="mt-3 flex flex-wrap gap-2">
				<button class="btn btn-primary h-10 text-sm" disabled={busy} onclick={() => act('returned')} data-testid="loan-returned">{loan.role === 'lender' || lenderOutside ? m.loan_mark_returned() : m.loan_gave_back()}</button>
				{#if ownsDate}
					<button class="btn btn-secondary h-10 text-sm" onclick={startExtend} data-testid="loan-change-date">{m.loan_change_date()}</button>
				{:else if !loan.extensionTo}
					<button class="btn btn-secondary h-10 text-sm" onclick={startExtend} data-testid="loan-extend">{m.loan_ask_more_time()}</button>
				{/if}
			</div>
		{/if}
	{/if}
	{#if failed}<p class="mt-2 text-sm text-danger" role="alert">{m.loan_failed()}</p>{/if}
</article>
