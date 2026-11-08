<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{m.household_join_title()} · bok</title></svelte:head>

<TopBar title={m.household_join_title()} back="/" />
<main class="page">
	<div class="card space-y-4 p-6 text-center">
		<Icon name="library" size={36} class="mx-auto text-accent" />
		{#if !data.invite}
			<p class="font-semibold">{m.household_invite_invalid()}</p>
		{:else if data.already}
			<p class="font-semibold">{m.household_already_member({ name: data.invite.name })}</p>
			<a href="/library?view=shelves" class="btn btn-secondary">{m.nav_library()}</a>
		{:else}
			<p class="text-lg">{data.invite.inviter ? m.household_invited_by({ name: data.invite.inviter, library: data.invite.name }) : m.household_invited({ library: data.invite.name })}</p>
			<p class="text-sm text-muted">{m.household_join_explain()}</p>
			<form method="POST"><button class="btn btn-primary w-full">{m.household_join()}</button></form>
		{/if}
	</div>
</main>
