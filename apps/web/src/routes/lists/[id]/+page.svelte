<script lang="ts">
	import { enhance } from '$app/forms';
	import BookCover from '#lib/components/BookCover.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import ShareButton from '#lib/components/ShareButton.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const list = $derived(data.list);
	// svelte-ignore state_referenced_locally
	let items = $state(structuredClone(data.items));
	$effect.pre(() => {
		items = structuredClone(data.items);
	});
	let editingSettings = $state(false);
	let confirmDelete = $state(false);
	let noteFor = $state<string | null>(null);
	let noteText = $state('');
	let error = $state(false);

	const api = (path: string, method: string, body?: unknown) =>
		fetch(`/api/v1/readlists/${list.id}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then((r) => {
			if (!r.ok) error = true;
			return r;
		});

	async function persistMove(index: number) {
		const item = items[index]!;
		await api('/move', 'POST', { itemId: item.id, afterId: items[index - 1]?.id ?? null });
	}

	function step(index: number, dir: -1 | 1) {
		const to = index + dir;
		if (to < 0 || to >= items.length) return;
		const next = [...items];
		const [it] = next.splice(index, 1);
		next.splice(to, 0, it!);
		items = next;
		void persistMove(to);
	}

	// ── Drag to reorder (pointer events: works with touch and mouse) ──
	let dragId = $state<string | null>(null);
	let listEl = $state<HTMLUListElement>();
	let startIndex = -1;

	function dragStart(e: PointerEvent, id: string) {
		e.preventDefault();
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		dragId = id;
		startIndex = items.findIndex((i) => i.id === id);
	}

	function dragMove(e: PointerEvent) {
		if (!dragId) return;
		// Target index = how many other rows have their midpoint above the pointer.
		const others = [...(listEl?.querySelectorAll<HTMLElement>("li[data-item]") ?? [])].filter((r) => r.dataset.item !== dragId);
		let to = 0;
		for (const r of others) {
			const box = r.getBoundingClientRect();
			if (e.clientY > box.top + box.height / 2) to++;
		}
		const from = items.findIndex((i) => i.id === dragId);
		if (to !== from) {
			const next = [...items];
			const [it] = next.splice(from, 1);
			next.splice(to, 0, it!);
			items = next;
		}
	}

	async function dragEnd() {
		if (!dragId) return;
		const to = items.findIndex((i) => i.id === dragId);
		dragId = null;
		if (to !== startIndex) await persistMove(to);
	}

	async function remove(id: string) {
		items = items.filter((i) => i.id !== id);
		await api(`/items/${id}`, 'DELETE');
	}

	async function saveNote(id: string) {
		items = items.map((i) => (i.id === id ? { ...i, note: noteText } : i));
		noteFor = null;
		await api(`/items/${id}`, 'PATCH', { note: noteText });
	}
</script>

<svelte:head><title>{list.title} · bok</title></svelte:head>

<TopBar title={list.title} back="/lists">
	{#snippet actions()}
		<button class="btn btn-ghost h-10 px-3 text-sm" onclick={() => (editingSettings = !editingSettings)} data-testid="list-settings"><Icon name="settings" size={18} /></button>
	{/snippet}
</TopBar>
<main class="page space-y-4" onpointermove={dragMove} onpointerup={dragEnd} onpointercancel={dragEnd}>
	{#if editingSettings}
		<form method="POST" action="?/settings" use:enhance={() => async ({ update }) => { await update({ reset: false }); editingSettings = false; }} class="card space-y-3 p-4">
			<input class="input" name="title" defaultValue={list.title} maxlength="120" required aria-label={m.lists_title_label()} />
			<textarea class="input" name="description" rows="2" maxlength="2000" defaultValue={list.description} placeholder={m.lists_description()}></textarea>
			<select class="input" name="visibility" value={list.visibility} aria-label={m.lists_visibility()}>
				<option value="private">{m.list_vis_private()}</option>
				<option value="unlisted">{m.list_vis_unlisted()}</option>
				<option value="public">{m.list_vis_public()}</option>
			</select>
			<p class="text-xs text-muted">{m.lists_visibility_hint()}</p>
			{#if form?.error}<p class="field-error">{form.error}</p>{/if}
			<button class="btn btn-primary w-full">{m.common_save()}</button>
			{#if confirmDelete}
				<div class="flex gap-2">
					<button class="btn btn-danger flex-1" formaction="?/delete">{m.lists_delete_confirm()}</button>
					<button type="button" class="btn btn-secondary" onclick={() => (confirmDelete = false)}>{m.common_cancel()}</button>
				</div>
			{:else}
				<button type="button" class="btn btn-ghost w-full text-danger" onclick={() => (confirmDelete = true)}>{m.lists_delete()}</button>
			{/if}
		</form>
	{/if}

	{#if list.description}<p class="px-1 leading-relaxed whitespace-pre-line">{list.description}</p>{/if}

	<div class="card flex items-center gap-2 p-3 text-sm">
		<span class="flex-1 truncate text-muted">{list.visibility === 'private' ? m.lists_private_note() : data.shareUrl}</span>
		{#if list.visibility !== 'private'}
			<ShareButton url={data.shareUrl} title={list.title} />
		{/if}
		<a href="/l/{list.slug}" class="btn btn-secondary h-9 px-3 text-sm">{m.lists_view()}</a>
	</div>

	{#if error}<p class="field-error">{m.error_generic()}</p>{/if}

	{#if items.length}
		<ul class="card divide-y divide-line/60" bind:this={listEl} data-testid="list-items">
			{#each items as it, i (it.id)}
				<li class="flex items-start gap-2 bg-surface p-2.5 {dragId === it.id ? 'relative z-10 shadow-lg ring-2 ring-accent' : ''}" data-item={it.id} data-title={it.title}>
					<button class="mt-3 grid h-10 w-7 shrink-0 cursor-grab touch-none place-items-center text-muted active:cursor-grabbing" onpointerdown={(e) => dragStart(e, it.id)} aria-label={m.lists_drag()} data-testid="drag">
						<svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true"><g fill="currentColor">{#each [3, 10, 17] as y (y)}<circle cx="3" cy={y} r="1.6" /><circle cx="9" cy={y} r="1.6" />{/each}</g></svg>
					</button>
					<span class="mt-1 w-5 shrink-0 text-right font-serif text-sm font-bold text-muted">{i + 1}</span>
					<a href="/book/{it.workId}" class="shrink-0" tabindex="-1" aria-hidden="true"><BookCover src={it.cover} title={it.title} author={it.authors[0]} width={44} /></a>
					<div class="min-w-0 flex-1">
						<p class="truncate font-medium">{it.title}</p>
						<p class="truncate text-xs text-muted">{it.authors.join(', ')}</p>
						{#if noteFor === it.id}
							<div class="mt-1.5 flex gap-1">
								<!-- svelte-ignore a11y_autofocus -->
								<input class="input h-9 flex-1 text-sm" bind:value={noteText} maxlength="1000" autofocus aria-label={m.lists_note()} onkeydown={(e) => e.key === 'Enter' && saveNote(it.id)} />
								<button class="btn btn-primary h-9 px-3 text-sm" onclick={() => saveNote(it.id)}>{m.common_save()}</button>
							</div>
						{:else}
							<button class="mt-1 text-left text-xs {it.note ? 'text-ink' : 'text-accent'}" onclick={() => ((noteFor = it.id), (noteText = it.note))} data-testid="note">{it.note || `+ ${m.lists_note()}`}</button>
						{/if}
					</div>
					<div class="flex shrink-0 flex-col">
						<button class="grid size-8 place-items-center text-muted disabled:opacity-30" disabled={i === 0} onclick={() => step(i, -1)} aria-label={m.common_move_up()}>↑</button>
						<button class="grid size-8 place-items-center text-muted disabled:opacity-30" disabled={i === items.length - 1} onclick={() => step(i, 1)} aria-label={m.common_move_down()}>↓</button>
					</div>
					<button class="mt-1 grid size-8 shrink-0 place-items-center text-muted" onclick={() => remove(it.id)} aria-label={m.lists_remove()}><Icon name="x" size={16} /></button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="card p-6 text-center text-sm text-muted">{m.lists_empty_hint()}</p>
	{/if}
</main>
