<script lang="ts">
	import { booksText } from '#lib/utils/reading.ts';
	import Icon from './Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/** "Add to list…" sheet: toggle this book on each of my lists, or start a new list with it. */
	let { workId, editionId = null }: { workId: string; editionId?: string | null } = $props();
	let open = $state(false);
	let lists = $state<{ id: string; title: string; visibility: string; count: number; has: boolean }[] | null>(null);
	let newTitle = $state('');
	let busy = $state(false);

	async function load() {
		open = true;
		lists = null;
		const res = await fetch(`/api/v1/readlists?workId=${workId}`);
		lists = res.ok ? await res.json() : [];
	}

	async function toggle(l: { id: string; has: boolean }) {
		const has = !l.has;
		lists = lists!.map((x) => (x.id === l.id ? { ...x, has, count: x.count + (has ? 1 : -1) } : x));
		await fetch(`/api/v1/readlists/${l.id}/items`, { method: has ? 'POST' : 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workId, editionId }) });
	}

	async function create(e: SubmitEvent) {
		e.preventDefault();
		if (!newTitle.trim()) return;
		busy = true;
		const res = await fetch('/api/v1/readlists', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: newTitle, workId, editionId }) });
		busy = false;
		if (res.ok) {
			newTitle = '';
			await load();
		}
	}
</script>

<button type="button" class="btn btn-secondary w-full" onclick={load} data-testid="add-to-list"><Icon name="lists" size={18} />{m.lists_add_to()}</button>

{#if open}
	<div class="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={m.lists_add_to()}>
		<button class="flex-1" aria-label={m.common_close()} onclick={() => (open = false)}></button>
		<div class="max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
			<div class="mb-3 flex items-center">
				<h2 class="flex-1 font-serif text-lg font-bold">{m.lists_add_to()}</h2>
				<button class="grid size-10 place-items-center rounded-full hover:bg-line/50" onclick={() => (open = false)} aria-label={m.common_close()}><Icon name="x" /></button>
			</div>
			{#if lists === null}
				<p class="py-4 text-center text-sm text-muted">{m.common_loading()}</p>
			{:else}
				<ul class="card mb-3 divide-y divide-line/60">
					{#each lists as l (l.id)}
						<li>
							<label class="flex items-center gap-3 px-4 py-3" data-sheet-list={l.title}>
								<input type="checkbox" checked={l.has} onchange={() => toggle(l)} class="size-5 rounded border-line text-accent focus:ring-accent" />
								<span class="flex-1"><span class="block font-medium">{l.title}</span><span class="text-xs text-muted">{booksText(l.count)}</span></span>
							</label>
						</li>
					{:else}
						<li class="px-4 py-3 text-sm text-muted">{m.lists_none_yet()}</li>
					{/each}
				</ul>
				<form class="flex gap-2" onsubmit={create}>
					<input class="input h-11 flex-1" bind:value={newTitle} maxlength="120" placeholder={m.lists_new_with_book()} aria-label={m.lists_new()} />
					<button class="btn btn-primary h-11 px-4" disabled={busy || !newTitle.trim()}>{m.lists_create_short()}</button>
				</form>
			{/if}
		</div>
	</div>
{/if}
