<script lang="ts">
	import { enhance } from '$app/forms';
	import PersonRow from '#lib/components/PersonRow.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{m.people_requests()} · bok</title></svelte:head>

<TopBar title={m.people_requests()} back="/people" />
<main class="page space-y-5">
	<section>
		<h2 class="section-title">{m.people_incoming()}</h2>
		{#if data.incoming.length}
			<div class="card divide-y divide-line/60">
				{#each data.incoming as person (person.userId)}
					<PersonRow {person}>
						{#snippet trailing()}
							<form method="POST" action="?/accept" use:enhance class="contents"><input type="hidden" name="userId" value={person.userId} /><button class="btn btn-primary h-9 px-3 text-sm" data-testid="accept-{person.handle}">{m.social_accept()}</button></form>
							<form method="POST" action="?/decline" use:enhance class="contents"><input type="hidden" name="userId" value={person.userId} /><button class="btn btn-ghost h-9 px-2 text-sm" aria-label={m.social_decline()}>✕</button></form>
						{/snippet}
					</PersonRow>
				{/each}
			</div>
		{:else}
			<p class="px-1 text-sm text-muted">{m.people_no_requests()}</p>
		{/if}
	</section>
	{#if data.outgoing.length}
		<section>
			<h2 class="section-title">{m.people_outgoing()}</h2>
			<div class="card divide-y divide-line/60">
				{#each data.outgoing as person (person.userId)}
					<PersonRow {person}>
						{#snippet trailing()}
							<form method="POST" action="?/decline" use:enhance class="contents"><input type="hidden" name="userId" value={person.userId} /><button class="btn btn-ghost h-9 px-3 text-sm">{m.social_cancel_request()}</button></form>
						{/snippet}
					</PersonRow>
				{/each}
			</div>
		</section>
	{/if}
</main>
