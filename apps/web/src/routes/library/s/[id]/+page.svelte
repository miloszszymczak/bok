<script lang="ts">
	import { enhance } from '$app/forms';
	import Barcode from '#lib/components/Barcode.svelte';
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

	<section class="card space-y-3 p-4" data-testid="shelf-label">
		<div class="flex items-center gap-2">
			<Icon name="tag" size={18} class="text-accent" />
			<h2 class="flex-1 font-semibold">{m.shelf_label_title()}</h2>
			{#if data.section.code}
				<form method="POST" action="?/removeCode" use:enhance><button class="btn btn-ghost h-9 px-2 text-sm text-danger">{m.shelf_label_remove()}</button></form>
			{/if}
		</div>
		{#if data.section.code}
			<div class="rounded-lg border-2 border-outline bg-white p-2">
				<Barcode value={data.section.code} height={40} class="h-12 w-full" />
				<p class="mt-1 text-center font-mono text-xs tracking-widest text-[#2b2a24]" data-testid="shelf-code">{data.section.code}</p>
			</div>
			<p class="text-xs text-muted">{m.shelf_label_hint()}</p>
		{:else}
			<p class="text-sm text-muted">{m.shelf_label_none()}</p>
		{/if}
		<div class="grid grid-cols-2 gap-2">
			<a href="/library/labels?section={data.section.id}" class="btn btn-secondary h-11 px-3 text-sm"><Icon name="printer" size={18} />{m.shelf_label_print()}</a>
			<a href="/scan?assign={data.section.id}" class="btn btn-secondary h-11 px-3 text-sm" data-testid="assign-label"><Icon name="barcode" size={18} />{data.section.code ? m.shelf_label_change() : m.shelf_label_assign()}</a>
		</div>
	</section>

	<MovableBookList books={data.books} tree={data.tree} current={data.section.id} />
	{#if !data.books.length}<p class="card p-6 text-center text-sm text-muted">{m.shelves_shelf_empty()}</p>{/if}
</main>
