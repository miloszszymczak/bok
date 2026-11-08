<script lang="ts">
	import BookCover from './BookCover.svelte';
	import Icon from './Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { Inventory } from '#lib/client/inventory.svelte.ts';

	let { inv, label, placeOf, online }: { inv: Inventory; label: string; placeOf: (id: string | null | undefined) => string; online: boolean } = $props();
	let showMissing = $state(false);
	const misplaced = $derived(inv.items.filter((i) => i.kind === 'misplaced'));
	const unknown = $derived(inv.items.filter((i) => i.kind === 'unknown'));
</script>

<div class="space-y-4" data-testid="inventory">
	<div class="grid grid-cols-4 gap-2 text-center">
		<div class="card p-2"><p class="text-xl font-bold text-accent" data-testid="inv-confirmed">{inv.seen.length}</p><p class="text-[11px] text-muted">{m.inventory_confirmed()}</p></div>
		<div class="card p-2"><p class="text-xl font-bold {inv.missing.length ? 'text-danger' : ''}" data-testid="inv-missing">{inv.missing.length}</p><p class="text-[11px] text-muted">{inv.finished ? m.inventory_missing() : m.inventory_not_yet()}</p></div>
		<div class="card p-2"><p class="text-xl font-bold {misplaced.length ? 'text-warn' : ''}" data-testid="inv-misplaced">{misplaced.length}</p><p class="text-[11px] text-muted">{m.inventory_misplaced()}</p></div>
		<div class="card p-2"><p class="text-xl font-bold" data-testid="inv-unknown">{unknown.length}</p><p class="text-[11px] text-muted">{m.inventory_unknown()}</p></div>
	</div>
	{#if !inv.ready}<p class="text-center text-sm text-muted">{m.common_loading()}</p>{/if}

	{#if misplaced.length}
		<section>
			<h3 class="section-title">⇄ {m.inventory_misplaced_title({ shelf: label })}</h3>
			<ul class="space-y-2">
				{#each misplaced as i (i.key)}
					<li class="card flex items-center gap-3 p-2.5" data-inv="misplaced" data-code={i.code}>
						<BookCover src={i.book?.cover} title={i.book?.title ?? i.code} width={36} />
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{i.book?.title}</p>
							<p class="truncate text-xs text-muted">{m.inventory_recorded_at({ place: placeOf(i.fromSectionId) })}</p>
						</div>
						{#if i.fixed}<span class="text-sm font-semibold text-accent">✓ {m.inventory_moved()}</span>
						{:else}<button class="btn btn-secondary h-9 px-3 text-sm" disabled={i.busy || !online} onclick={() => inv.moveHere(i)}>{m.inventory_move_here()}</button>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if unknown.length}
		<section>
			<h3 class="section-title">+ {m.inventory_unknown_title()}</h3>
			<ul class="space-y-2">
				{#each unknown as i (i.key)}
					<li class="card flex items-center gap-3 p-2.5" data-inv="unknown" data-code={i.code}>
						<BookCover src={i.book?.cover} title={i.book?.title ?? i.code} width={36} />
						<p class="min-w-0 flex-1 truncate text-sm font-medium">{i.book?.title ?? i.code}</p>
						{#if i.fixed}<span class="text-sm font-semibold text-accent">✓ {m.inventory_added()}</span>
						{:else}<button class="btn btn-secondary h-9 px-3 text-sm" disabled={i.busy || !online} onclick={() => inv.addHere(i)}>{m.inventory_add_here()}</button>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if inv.missing.length}
		<section>
			<button class="section-title flex w-full items-center gap-1 text-left" onclick={() => (showMissing = !showMissing)} aria-expanded={showMissing || inv.finished}>
				✗ {inv.finished ? m.inventory_missing_title() : m.inventory_not_yet_title()} ({inv.missing.length})
				<Icon name="forward" size={14} class="transition {showMissing || inv.finished ? 'rotate-90' : ''}" />
			</button>
			{#if showMissing || inv.finished}
				<ul class="space-y-2">
					{#each inv.missing as e (e.copyId)}
						<li class="card flex items-center gap-3 p-2.5" data-inv="missing" data-copy={e.copyId}>
							<BookCover src={e.book.cover} title={e.book.title} width={36} />
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">{e.book.title}</p>
								<p class="truncate text-xs text-muted">{e.book.authors.join(', ')}</p>
							</div>
							{#if inv.finished}
								{#if e.unsorted}<span class="text-xs font-semibold text-muted">{m.inventory_unsorted_done()}</span>
								{:else}<button class="btn btn-ghost h-9 px-2 text-xs" disabled={!online} onclick={() => inv.unsort(e.copyId)}>{m.inventory_take_off()}</button>{/if}
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	{#if inv.items.length}
		<section>
			<h3 class="section-title">{m.inventory_scanned()}</h3>
			<ul class="space-y-1 text-sm">
				{#each inv.items.slice(0, 30) as i (i.key)}
					<li class="flex items-center gap-2" data-inv-log={i.kind}>
						<span class="w-5 text-center">{i.kind === 'confirmed' ? '✓' : i.kind === 'misplaced' ? '⇄' : i.kind === 'repeat' ? '↻' : '+'}</span>
						<span class="min-w-0 flex-1 truncate">{i.book?.title ?? i.code}</span>
						{#if i.kind === 'repeat'}<span class="text-xs text-muted">{m.inventory_repeat()}</span>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
