<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/Icon.svelte';
	import MovableBookList from '#lib/components/MovableBookList.svelte';
	import ShelfSketch from '#lib/components/ShelfSketch.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let renaming = $state(false);
	const p = $derived(data.place);
</script>

<svelte:head><title>{p.containerName} {data.section.label} · bok</title></svelte:head>

<TopBar title="{m.shelves_shelf()} {data.section.label}" back="/library/c/{p.containerId}">
	{#snippet actions()}
		<button class="btn btn-ghost h-10 px-3 text-sm" onclick={() => (renaming = !renaming)}><Icon name="pencil" size={18} />{m.shelves_rename()}</button>
	{/snippet}
</TopBar>
<main class="page space-y-4">
	<p class="px-1 text-sm text-muted" data-testid="breadcrumb"><a href="/library/r/{p.locationId}" class="underline">{p.locationName}</a> › <a href="/library/c/{p.containerId}" class="underline">{p.containerName}</a> › <span class="font-semibold text-ink">{data.section.label}</span></p>

	{#if renaming}
		<form method="POST" action="?/rename" use:enhance={() => async ({ update }) => { await update({ reset: false }); renaming = false; }} class="card flex gap-2 p-3">
			<input class="input h-11 flex-1" name="label" defaultValue={data.section.customLabel ?? ''} placeholder={data.section.label} maxlength="20" aria-label={m.shelves_rename()} />
			<button class="btn btn-primary h-11 px-4">{m.common_save()}</button>
		</form>
		<p class="px-1 text-xs text-muted">{m.shelves_rename_hint()}</p>
	{/if}

	<div class="card mx-auto max-w-sm p-3">
		<ShelfSketch layout={data.container.layout} sections={data.container.sections} highlight={[data.section.id]} title={p.containerName} books={false} />
	</div>

	<div class="grid grid-cols-2 gap-3">
		<a href="/scan?target={data.section.id}" class="btn btn-primary"><Icon name="scan" size={18} />{m.shelves_scan_onto()}</a>
		<a href="/scan?inventory={data.section.id}" class="btn btn-secondary"><Icon name="check" size={18} />{m.inventory_start()}</a>
	</div>
	{#if data.lastInventory}
		<p class="px-1 text-xs text-muted">{m.inventory_last({ date: new Date(data.lastInventory.at).toLocaleDateString(getLocale()), missing: data.lastInventory.missing, misplaced: data.lastInventory.misplaced })}</p>
	{/if}

	<MovableBookList books={data.books} tree={data.tree} current={data.section.id} />
	{#if !data.books.length}<p class="card p-6 text-center text-sm text-muted">{m.shelves_shelf_empty()}</p>{/if}
</main>
