<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<svelte:head><title>{m.nav_lists()} · bok</title></svelte:head>

<TopBar title={m.nav_lists()} />
<main class="page">
	<div class="card p-6 text-center text-muted">
		<Icon name="lists" size={36} class="mx-auto" />
		<p class="mt-3 font-semibold text-ink">{m.lists_soon()}</p>
		<p class="mt-1 text-sm">{m.lists_soon_hint()}</p>
	</div>
</main>
