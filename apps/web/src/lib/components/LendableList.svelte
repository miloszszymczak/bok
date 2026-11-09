<script lang="ts">
	import BookCover from './BookCover.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/** Someone's lendable copies with "Ask to borrow". */
	type Item = { copyId: string; workId: string; editionId: string; title: string; authors: string[]; cover: string | null; available: boolean; requestedLoanId: string | null };
	let { items }: { items: Item[] } = $props();
	let asked = $state<Record<string, boolean>>({});
	let failed = $state<string | null>(null);

	async function ask(copyId: string) {
		failed = null;
		const r = await fetch('/api/v1/loans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'request', copyId }) });
		if (r.ok || r.status === 409) asked = { ...asked, [copyId]: true };
		else failed = copyId;
	}
</script>

<ul class="card divide-y divide-line/60" data-testid="lendable-list">
	{#each items as c (c.copyId)}
		<li class="flex items-center gap-3 p-3" data-lendable-copy={c.copyId}>
			<a href="/book/{c.workId}?e={c.editionId}" class="shrink-0" aria-label={c.title}><BookCover src={c.cover} title={c.title} author={c.authors[0]} width={40} /></a>
			<span class="min-w-0 flex-1"><span class="line-clamp-2 font-medium">{c.title}</span><span class="block truncate text-xs text-muted">{c.authors.join(', ')}{c.available ? '' : ` · ${m.loan_on_loan()}`}</span></span>
			{#if c.requestedLoanId || asked[c.copyId]}
				<span class="text-sm text-muted" data-testid="asked">{m.loan_asked()}</span>
			{:else}
				<button class="btn btn-secondary h-9 px-3 text-sm" onclick={() => ask(c.copyId)} data-testid="ask-borrow">{m.loan_ask_borrow()}</button>
			{/if}
			{#if failed === c.copyId}<span class="sr-only" role="alert">{m.loan_failed()}</span>{/if}
		</li>
	{/each}
</ul>
