<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import TopBar from '#lib/components/TopBar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import LoanCard from '#lib/components/LoanCard.svelte';
	import BorrowedSheet from '#lib/components/BorrowedSheet.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let adding = $state(false);
	const requests = $derived(data.incoming.length + data.outgoing.length);
	const empty = $derived(!requests && !data.lent.length && !data.borrowed.length && !data.history.length);
</script>

<svelte:head><title>{m.loans_title()} · bok</title></svelte:head>

<TopBar title={data.withUser ? m.loans_with({ name: data.withUser.displayName }) : m.loans_title()} back={data.withUser ? `/u/${data.withUser.handle}` : '/library'}>
	{#snippet actions()}
		<button class="btn btn-ghost h-10 px-3 text-sm" onclick={() => (adding = true)} data-testid="add-borrowed"><Icon name="plus" size={18} />{m.loans_add_borrowed()}</button>
	{/snippet}
</TopBar>

<main class="page space-y-6">
	{#if data.incoming.length || data.outgoing.length}
		<section data-testid="loans-requests">
			<h2 class="section-title">{m.loans_requests()}</h2>
			<div class="space-y-3">
				{#each [...data.incoming, ...data.outgoing] as l (l.id)}<LoanCard loan={l} />{/each}
			</div>
		</section>
	{/if}
	<section data-testid="loans-lent">
		<h2 class="section-title">{m.loans_lent()}</h2>
		<div class="space-y-3">
			{#each data.lent as l (l.id)}<LoanCard loan={l} />{:else}<p class="card p-4 text-sm text-muted">{m.loans_lent_empty()}</p>{/each}
		</div>
	</section>
	<section data-testid="loans-borrowed">
		<h2 class="section-title">{m.loans_borrowed()}</h2>
		<div class="space-y-3">
			{#each data.borrowed as l (l.id)}<LoanCard loan={l} />{:else}<p class="card p-4 text-sm text-muted">{m.loans_borrowed_empty()}</p>{/each}
		</div>
	</section>
	{#if data.history.length}
		<section data-testid="loans-history">
			<h2 class="section-title">{m.loans_history()}</h2>
			<div class="space-y-3">
				{#each data.history as l (l.id)}<LoanCard loan={l} />{/each}
			</div>
		</section>
	{/if}
	{#if empty}<p class="text-center text-sm text-muted">{m.loans_hint()}</p>{/if}
</main>

{#if adding}<BorrowedSheet onclose={() => (adding = false)} ondone={() => ((adding = false), invalidateAll())} />{/if}
