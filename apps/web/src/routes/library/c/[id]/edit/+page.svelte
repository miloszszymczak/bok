<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Layout } from '@bok/core';
	import Icon from '#lib/components/Icon.svelte';
	import SectionPicker from '#lib/components/SectionPicker.svelte';
	import ShelfDesigner from '#lib/components/ShelfDesigner.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	// svelte-ignore state_referenced_locally
	let layout = $state<Layout>(structuredClone(data.bookcase.layout)); // edited copy, saved explicitly
	const labels = $derived(Object.fromEntries(data.bookcase.sections.filter((s) => s.customLabel).map((s) => [`${s.col}:${s.row}`, s.label])));
	let busy = $state(false);
	let orphans = $state<{ sectionId: string; label: string; count: number }[] | null>(null);
	let picking = $state(false);
	let failed = $state(false);

	async function save(orphansTo?: string | null) {
		busy = true;
		failed = false;
		try {
			const res = await fetch(`/api/v1/containers/${data.bookcase.id}/layout`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(orphansTo === undefined ? { layout } : { layout, orphansTo })
			});
			const body = await res.json();
			if (res.status === 409) {
				orphans = body.orphans;
				return;
			}
			if (!res.ok) throw new Error(String(res.status));
			await goto(`/library/c/${data.bookcase.id}`, { invalidateAll: true });
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}

	// Shelves that survive the edit (for "move the books to…").
	const removedIds = $derived(new Set(orphans?.map((o) => o.sectionId) ?? []));
	const pickerTree = $derived({
		locations: data.tree.locations.map((l) => ({ ...l, containers: l.containers.map((c) => ({ ...c, sections: c.sections.filter((s) => !removedIds.has(s.id)) })) }))
	});
</script>

<svelte:head><title>{m.shelves_edit_layout()} · bok</title></svelte:head>

<TopBar title={data.bookcase.name} back="/library/c/{data.bookcase.id}" />
<main class="page space-y-4">
	<ShelfDesigner bind:layout {labels} />

	{#if orphans}
		<div class="card space-y-3 border-warn p-4" role="alert">
			<p class="flex items-start gap-2 text-sm"><Icon name="alert" class="shrink-0 text-warn" size={20} />{m.designer_orphans({ shelves: orphans.map((o) => `${o.label} (${o.count})`).join(', ') })}</p>
			<div class="grid gap-2">
				<button class="btn btn-secondary" onclick={() => (picking = true)} disabled={busy}>{m.designer_orphans_pick()}</button>
				<button class="btn btn-ghost" onclick={() => save(null)} disabled={busy}>{m.designer_orphans_unsorted()}</button>
			</div>
		</div>
	{/if}
	{#if failed}<p class="field-error">{m.error_generic()}</p>{/if}

	<button class="btn btn-primary w-full" onclick={() => save()} disabled={busy}>{busy ? m.common_loading() : m.common_save()}</button>
</main>

<SectionPicker tree={pickerTree} bind:open={picking} title={m.designer_orphans_pick()} onpick={(id) => save(id)} />
