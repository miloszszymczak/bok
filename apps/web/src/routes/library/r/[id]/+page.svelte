<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/Icon.svelte';
	import ShelfSketch from '#lib/components/ShelfSketch.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let editing = $state(false);
	let confirmDelete = $state(false);
</script>

<svelte:head><title>{data.room.name} · bok</title></svelte:head>

<TopBar title={data.room.name} back="/library?view=shelves">
	{#snippet actions()}
		<button class="btn btn-ghost h-10 px-3 text-sm" onclick={() => (editing = !editing)}><Icon name="pencil" size={18} />{m.book_edit()}</button>
	{/snippet}
</TopBar>
<main class="page space-y-4">
	{#if editing}
		<form method="POST" action="?/rename" use:enhance={() => async ({ update }) => { await update({ reset: false }); editing = false; }} class="card flex gap-2 p-3">
			<input class="input h-11 flex-1" name="name" defaultValue={data.room.name} required maxlength="80" aria-label={m.shelves_room_name()} />
			<button class="btn btn-primary h-11 px-4">{m.common_save()}</button>
		</form>
		{#if form?.error}<p class="field-error">{form.error}</p>{/if}
	{/if}

	{#each data.room.containers as c, i (c.id)}
		<div class="card flex items-center gap-3 p-3">
			<a href="/library/c/{c.id}" class="w-24 shrink-0"><ShelfSketch layout={c.layout} sections={c.sections} labels={false} title={c.name} /></a>
			<a href="/library/c/{c.id}" class="min-w-0 flex-1">
				<p class="truncate font-semibold">{c.name}</p>
				<p class="text-sm text-muted">{m.shelves_shelf_count({ count: c.sections.length })} · {m.shelves_book_count({ count: c.count })}</p>
			</a>
			<form method="POST" action="?/moveBookcase" use:enhance class="flex flex-col">
				<input type="hidden" name="id" value={c.id} />
				<button name="dir" value="up" class="grid size-8 place-items-center text-muted disabled:opacity-30" disabled={i === 0} aria-label={m.common_move_up()}>↑</button>
				<button name="dir" value="down" class="grid size-8 place-items-center text-muted disabled:opacity-30" disabled={i === data.room.containers.length - 1} aria-label={m.common_move_down()}>↓</button>
			</form>
		</div>
	{/each}

	<a href="/library/c/new?room={data.room.id}" class="btn btn-primary w-full"><Icon name="plus" size={18} />{m.shelves_add_bookcase()}</a>

	{#if editing}
		<div class="card space-y-3 border-danger/40 p-4">
			{#if confirmDelete}
				<p class="text-sm">{m.shelves_delete_room_confirm({ count: data.room.count })}</p>
				<form method="POST" action="?/delete" class="flex gap-2">
					<button class="btn btn-danger flex-1">{m.shelves_delete()}</button>
					<button type="button" class="btn btn-secondary" onclick={() => (confirmDelete = false)}>{m.common_cancel()}</button>
				</form>
			{:else}
				<button class="btn btn-ghost w-full text-danger" onclick={() => (confirmDelete = true)}>{m.shelves_delete_room()}</button>
			{/if}
		</div>
	{/if}
</main>
