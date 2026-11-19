<script lang="ts">
	import { cellsOf, isSingleCompartment, kindLayout, STORAGE_KINDS, type StorageKind } from '@bok/core';
	import ShelfDesigner from '#lib/components/ShelfDesigner.svelte';
	import ShelfSketch from '#lib/components/ShelfSketch.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { kindCreate, kindHint, kindName, kindPlaceholder } from '#lib/utils/storage.ts';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// svelte-ignore state_referenced_locally
	let layout = $state(kindLayout(data.kind ?? 'bookcase'));
	$effect.pre(() => {
		layout = kindLayout(data.kind ?? 'bookcase');
	});
	/** A preview of each kind: its default layout's cells with a few books on every shelf. */
	const sample = (k: StorageKind) => ({ layout: kindLayout(k), sections: cellsOf(kindLayout(k)).map((c) => ({ id: `sample-${k}-${c.col}-${c.row}`, ...c, label: '', count: 4 + ((c.col + c.row) % 3) * 3 })) });
</script>

<svelte:head><title>{data.kind ? kindCreate(data.kind) : m.storage_new()} · bok</title></svelte:head>

<TopBar title={data.kind ? kindName(data.kind) : m.storage_new()} back={data.kind ? `/library/c/new?room=${data.room.id}` : `/library/r/${data.room.id}`} />
<main class="page">
	{#if !data.kind}
		<p class="mb-4 px-1 text-sm text-muted">{m.storage_pick_kind({ room: data.room.name })}</p>
		<div class="grid grid-cols-2 gap-3" data-testid="kinds">
			{#each STORAGE_KINDS as k (k)}
				{@const s = sample(k)}
				<a href="/library/c/new?room={data.room.id}&kind={k}" class="card flex flex-col gap-2 p-3" data-kind={k} data-sveltekit-replacestate>
					<div class="flex h-24 items-end justify-center">
						<ShelfSketch layout={s.layout} sections={s.sections} kind={k} labels={false} title={kindName(k)} class={isSingleCompartment(k) ? 'h-20! w-auto!' : k === 'nightstand' ? 'h-16! w-auto!' : 'h-24! w-auto!'} />
					</div>
					<span class="font-serif text-lg leading-tight font-bold">{kindName(k)}</span>
					<span class="text-xs leading-snug text-muted">{kindHint(k)}</span>
				</a>
			{/each}
		</div>
	{:else}
		<form method="POST" class="space-y-4">
			<input type="hidden" name="kind" value={data.kind} />
			<div>
				<label class="label" for="name">{m.shelves_bookcase_name()}</label>
				<input class="input" id="name" name="name" required maxlength="80" placeholder={kindPlaceholder(data.kind)} />
				<p class="mt-1.5 text-xs text-muted">{m.shelves_in_room({ room: data.room.name })}</p>
			</div>
			{#if isSingleCompartment(data.kind)}
				<div class="card mx-auto w-40 p-4">
					<ShelfSketch layout={kindLayout(data.kind)} sections={sample(data.kind).sections} kind={data.kind} title={kindName(data.kind)} />
				</div>
				<p class="px-1 text-center text-sm text-muted">{m.storage_single_hint()}</p>
			{:else}
				<ShelfDesigner bind:layout />
				<input type="hidden" name="layout" value={JSON.stringify(layout)} />
			{/if}
			{#if form?.error}<p class="field-error">{form.error}</p>{/if}
			<button class="btn btn-primary w-full" data-testid="create-storage">{kindCreate(data.kind)}</button>
		</form>
	{/if}
</main>
