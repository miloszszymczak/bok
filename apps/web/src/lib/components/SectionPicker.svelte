<script lang="ts" module>
	import type { Layout } from '@bok/core';
	export interface PickerTree {
		locations: {
			id: string;
			name: string;
			containers: { id: string; name: string; layout: Layout; sections: { id: string; x: number; y: number; w: number; h: number; label: string; count?: number }[] }[];
		}[];
	}
</script>

<script lang="ts">
	import Icon from './Icon.svelte';
	import ShelfSketch from './ShelfSketch.svelte';
	import { m } from '#lib/paraglide/messages.js';

	let {
		tree,
		open = $bindable(false),
		title,
		current = null,
		allowUnsorted = false,
		onpick
	}: { tree: PickerTree | null; open?: boolean; title: string; current?: string | null; allowUnsorted?: boolean; onpick: (sectionId: string | null) => void } = $props();

	function pick(id: string | null) {
		open = false;
		onpick(id);
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex flex-col bg-black/40" role="dialog" aria-modal="true" aria-label={title}>
		<button class="h-12 shrink-0" aria-label={m.common_close()} onclick={() => (open = false)}></button>
		<div class="flex min-h-0 flex-1 flex-col rounded-t-2xl bg-bg">
			<div class="flex items-center gap-2 border-b border-line px-4 py-3">
				<h2 class="flex-1 font-serif text-lg font-bold">{title}</h2>
				<button class="grid size-10 place-items-center rounded-full hover:bg-line/50" onclick={() => (open = false)} aria-label={m.common_close()}><Icon name="x" /></button>
			</div>
			<div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
				{#if allowUnsorted}
					<button class="card flex w-full items-center gap-3 p-3 text-left {current === null ? 'ring-2 ring-accent' : ''}" onclick={() => pick(null)} data-pick="unsorted">
						<Icon name="library" class="text-muted" /><span class="font-medium">{m.shelves_unsorted()}</span>
					</button>
				{/if}
				{#if !tree?.locations.some((l) => l.containers.length)}
					<p class="text-center text-sm text-muted">{m.picker_empty()} <a href="/library?view=shelves" class="font-semibold text-accent">{m.picker_empty_cta()}</a></p>
				{/if}
				{#each tree?.locations ?? [] as loc (loc.id)}
					{#if loc.containers.length}
						<section>
							<h3 class="section-title">{loc.name}</h3>
							<div class="space-y-3">
								{#each loc.containers as c (c.id)}
									<div class="card p-3">
										<p class="mb-2 text-sm font-semibold">{c.name}</p>
										<div class="mx-auto max-w-xs">
											<ShelfSketch layout={c.layout} sections={c.sections} highlight={current ? [current] : []} onpick={pick} books={false} title={c.name} />
										</div>
										<div class="mt-3 flex flex-wrap gap-1.5">
											{#each c.sections as s (s.id)}
												<button class="rounded-lg border px-2.5 py-1 text-sm font-medium {s.id === current ? 'border-accent bg-accent text-accent-ink' : 'border-line'}" onclick={() => pick(s.id)} data-pick={s.id}>{s.label}</button>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						</section>
					{/if}
				{/each}
			</div>
		</div>
	</div>
{/if}
