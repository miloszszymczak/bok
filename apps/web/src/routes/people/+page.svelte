<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import PersonRow from '#lib/components/PersonRow.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{m.people_title()} · bok</title></svelte:head>

<TopBar title={m.people_title()} back="/u/{data.profile?.handle}" />
<main class="page space-y-4">
	<a href="/people/requests" class="card flex items-center gap-3 p-4" data-testid="requests-link">
		<Icon name="user" class="text-accent" />
		<span class="flex-1 font-medium">{m.people_requests()}</span>
		{#if data.incomingCount}<span class="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink">{data.incomingCount}</span>{/if}
		<Icon name="forward" size={18} />
	</a>
	<form method="GET" class="relative" role="search">
		<Icon name="search" class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" size={20} />
		<!-- svelte-ignore a11y_autofocus -->
		<input class="input pl-12" type="search" name="q" defaultValue={data.q} placeholder={m.people_search_placeholder()} autocomplete="off" autofocus={!data.q} enterkeyhint="search" />
	</form>
	{#if data.q}
		{#if data.results.length}
			<div class="card divide-y divide-line/60" data-testid="people-results">
				{#each data.results as person (person.userId)}<PersonRow {person} />{/each}
			</div>
		{:else}
			<p class="px-1 text-sm text-muted">{m.people_no_results()}</p>
		{/if}
	{/if}
</main>
