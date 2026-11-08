<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Icon from '#lib/components/Icon.svelte';
	import ShelfSketch from '#lib/components/ShelfSketch.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const b = $derived(data.bookcase);
	let editing = $state(false);
	let confirmDelete = $state(false);
</script>

<svelte:head><title>{b.name} · bok</title></svelte:head>

<TopBar title={b.name} back="/library/r/{data.room.id}">
	{#snippet actions()}
		<button class="btn btn-ghost h-10 px-3 text-sm" onclick={() => (editing = !editing)}><Icon name="pencil" size={18} />{m.book_edit()}</button>
	{/snippet}
</TopBar>
<main class="page space-y-4">
	<p class="px-1 text-sm text-muted">{data.room.name} · {m.shelves_book_count({ count: b.count })}</p>
	<div class="card p-3">
		<ShelfSketch layout={b.layout} sections={b.sections} onpick={(id) => goto(`/library/s/${id}`)} title={b.name} />
		<p class="mt-2 text-center text-xs text-muted">{m.shelves_tap_shelf()}</p>
	</div>

	<div class="grid grid-cols-2 gap-3">
		<a href="/scan?target={b.sections[0]?.id ?? ''}" class="btn btn-primary"><Icon name="scan" size={18} />{m.shelves_scan_here()}</a>
		<a href="/library/c/{b.id}/edit" class="btn btn-secondary"><Icon name="settings" size={18} />{m.shelves_edit_layout()}</a>
	</div>

	{#if editing}
		<form method="POST" action="?/rename" use:enhance={() => async ({ update }) => { await update({ reset: false }); editing = false; }} class="card flex gap-2 p-3">
			<input class="input h-11 flex-1" name="name" defaultValue={b.name} required maxlength="80" aria-label={m.shelves_bookcase_name()} />
			<button class="btn btn-primary h-11 px-4">{m.common_save()}</button>
		</form>
		{#if form?.error}<p class="field-error">{form.error}</p>{/if}
		<div class="card space-y-3 border-danger/40 p-4">
			{#if confirmDelete}
				<p class="text-sm">{m.shelves_delete_bookcase_confirm({ count: b.count })}</p>
				<form method="POST" action="?/delete" class="flex gap-2">
					<button class="btn btn-danger flex-1">{m.shelves_delete()}</button>
					<button type="button" class="btn btn-secondary" onclick={() => (confirmDelete = false)}>{m.common_cancel()}</button>
				</form>
			{:else}
				<button class="btn btn-ghost w-full text-danger" onclick={() => (confirmDelete = true)}>{m.shelves_delete_bookcase()}</button>
			{/if}
		</div>
	{/if}
</main>
