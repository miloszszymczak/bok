<script lang="ts">
	import PersonRow from '#lib/components/PersonRow.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const title = $derived(data.kind === 'followers' ? m.profile_followers() : data.kind === 'following' ? m.profile_following() : m.profile_friends());
</script>

<svelte:head><title>{title} · {data.owner.displayName} · bok</title></svelte:head>

<TopBar title="{title} · @{data.owner.handle}" back="/u/{data.owner.handle}" />
<main class="page">
	{#if data.people.length}
		<div class="card divide-y divide-line/60">
			{#each data.people as person (person.userId)}<PersonRow {person} />{/each}
		</div>
	{:else}
		<p class="card p-6 text-center text-sm text-muted">{m.people_none()}</p>
	{/if}
</main>
