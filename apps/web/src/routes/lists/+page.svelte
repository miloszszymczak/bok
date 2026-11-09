<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import ListCard from '#lib/components/ListCard.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let creating = $state(false);
</script>

<svelte:head><title>{m.nav_lists()} · bok</title></svelte:head>

<TopBar title={m.nav_lists()}>
	{#snippet actions()}
		<button class="btn btn-ghost h-10 px-3" onclick={() => (creating = !creating)} aria-label={m.lists_new()} data-testid="new-list"><Icon name="plus" /></button>
	{/snippet}
</TopBar>
<main class="page space-y-6">
	{#if creating || !data.mine.length}
		<form method="POST" action="?/create" class="card space-y-3 p-4">
			<label class="label" for="title">{m.lists_new()}</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input class="input" id="title" name="title" maxlength="120" required placeholder={m.lists_title_placeholder()} autofocus={creating} />
			<select class="input" name="visibility" aria-label={m.lists_visibility()}>
				<option value="private">{m.list_vis_private()}</option>
				<option value="unlisted">{m.list_vis_unlisted()}</option>
				<option value="public">{m.list_vis_public()}</option>
			</select>
			{#if form?.error}<p class="field-error">{form.error}</p>{/if}
			<button class="btn btn-primary w-full">{m.lists_create()}</button>
		</form>
	{/if}

	{#if data.mine.length}
		<section>
			<h2 class="section-title">{m.lists_mine()}</h2>
			<div class="space-y-3">{#each data.mine as l (l.id)}<ListCard list={l} href="/lists/{l.id}" showVisibility />{/each}</div>
		</section>
	{/if}
	{#if data.saved.length}
		<section>
			<h2 class="section-title">{m.lists_saved()}</h2>
			<div class="space-y-3">{#each data.saved as l (l.id)}<ListCard list={l} href="/l/{l.slug}" showOwner />{/each}</div>
		</section>
	{/if}
</main>
