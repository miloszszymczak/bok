<script lang="ts">
	import { enhance } from '$app/forms';
	import BookRow from '#lib/components/BookRow.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import ShelfSketch from '#lib/components/ShelfSketch.svelte';
	import StatusMenu from '#lib/components/StatusMenu.svelte';
	import { statusLabel, type Status } from '#lib/utils/reading.ts';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let adding = $state(false);
</script>

<svelte:head><title>{m.nav_library()} · bok</title></svelte:head>

<TopBar title={m.nav_library()}>
	{#snippet actions()}
		<a href="/scan" class="btn btn-ghost h-10 px-3" aria-label={m.nav_scan()}><Icon name="plus" /></a>
	{/snippet}
</TopBar>
<main class="page">
	<div class="mb-4 grid grid-cols-2 rounded-xl bg-line/50 p-1 text-sm font-semibold" role="tablist">
		<a href="/library" role="tab" aria-selected={data.view === 'books'} class="rounded-lg py-2 text-center {data.view === 'books' ? 'bg-surface shadow-sm' : 'text-muted'}" data-sveltekit-replacestate>{m.library_tab_books()}</a>
		<a href="/library?view=shelves" role="tab" aria-selected={data.view === 'shelves'} class="rounded-lg py-2 text-center {data.view === 'shelves' ? 'bg-surface shadow-sm' : 'text-muted'}" data-sveltekit-replacestate>{m.library_tab_shelves()}</a>
	</div>

	{#if data.view === 'books'}
		<form method="GET" class="relative" role="search">
			<Icon name="search" class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" size={20} />
			<input class="input pl-12" type="search" name="q" defaultValue={data.q} placeholder={m.library_filter()} enterkeyhint="search" />
		</form>
		<div class="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 text-sm" data-testid="status-filter">
			{#each [null, 'want_to_read', 'reading', 'stuck', 'read', 'dnf', 'none'] as s (s ?? 'all')}
				{@const href = (() => { const u = new URLSearchParams(); if (data.q) u.set('q', data.q); if (s) u.set('status', s); if (data.tagFilter) u.set('tag', data.tagFilter); const q = u.toString(); return q ? `/library?${q}` : '/library'; })()}
				<a {href} data-sveltekit-replacestate class="shrink-0 rounded-full border px-3 py-1 {(data.statusFilter ?? null) === s ? 'border-accent bg-accent text-accent-ink' : 'border-line'}">
					{s === null ? m.filter_all() : s === 'none' ? m.status_none() : statusLabel(s as Status)}
				</a>
			{/each}
		</div>
		{#if data.myTags.length}
			<div class="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 text-xs">
				{#each data.myTags as t (t.slug)}
					{@const u = (() => { const p = new URLSearchParams(); if (data.q) p.set('q', data.q); if (data.statusFilter) p.set('status', data.statusFilter); if (data.tagFilter !== t.slug) p.set('tag', t.slug); const q = p.toString(); return q ? `/library?${q}` : '/library'; })()}
					<a href={u} data-sveltekit-replacestate class="shrink-0 rounded-full border px-2.5 py-0.5 {data.tagFilter === t.slug ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted'}">#{t.name}</a>
				{/each}
			</div>
		{/if}
		<p class="mt-3 mb-2 px-1 text-sm text-muted">{m.library_count({ count: data.books.length })}</p>
		{#if data.books.length}
			<div class="card divide-y divide-line/60 p-1">
				{#each data.books as b (b.copyId)}
					<BookRow href="/book/{b.workId}?e={b.editionId}" title={b.title} authors={b.authors} meta={b.place ?? m.shelves_unsorted()} cover={b.cover} srcset={b.srcset ?? undefined}>
						{#snippet trailing()}<StatusMenu workId={b.workId} status={b.status} />{/snippet}
					</BookRow>
				{/each}
			</div>
		{:else}
			<div class="card p-6 text-center text-muted">
				<p>{data.q ? m.library_no_match() : m.home_empty()}</p>
				{#if !data.q}<a href="/scan" class="btn btn-primary mt-4"><Icon name="scan" />{m.home_action_scan()}</a>{/if}
			</div>
		{/if}
	{:else}
		{#if data.tree.unsorted}
			<a href="/library/unsorted" class="card mb-5 flex items-center gap-3 p-4" data-testid="unsorted">
				<Icon name="library" class="text-warn" />
				<span class="flex-1"><span class="font-semibold">{m.shelves_unsorted()}</span><br /><span class="text-sm text-muted">{m.shelves_unsorted_hint({ count: data.tree.unsorted })}</span></span>
				<Icon name="forward" size={18} />
			</a>
		{/if}

		{#each data.tree.locations as loc, i (loc.id)}
			<section class="mb-6">
				<div class="mb-2 flex items-center gap-1 px-1">
					<a href="/library/r/{loc.id}" class="flex-1 truncate font-serif text-lg font-bold">{loc.name} <span class="text-sm font-normal text-muted">· {loc.count}</span></a>
					<form method="POST" action="?/moveRoom" use:enhance class="flex">
						<input type="hidden" name="id" value={loc.id} />
						<button name="dir" value="up" class="grid size-8 place-items-center rounded-full text-muted disabled:opacity-30" disabled={i === 0} aria-label={m.common_move_up()}>↑</button>
						<button name="dir" value="down" class="grid size-8 place-items-center rounded-full text-muted disabled:opacity-30" disabled={i === data.tree.locations.length - 1} aria-label={m.common_move_down()}>↓</button>
					</form>
				</div>
				{#if loc.containers.length}
					<div class="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
						{#each loc.containers as c (c.id)}
							<a href="/library/c/{c.id}" class="card w-40 shrink-0 snap-start p-2.5">
								<ShelfSketch layout={c.layout} sections={c.sections} labels={false} title={c.name} />
								<p class="mt-2 truncate text-sm font-semibold">{c.name}</p>
								<p class="text-xs text-muted">{m.shelves_book_count({ count: c.count })}</p>
							</a>
						{/each}
						<a href="/library/c/new?room={loc.id}" class="card grid w-28 shrink-0 snap-start place-items-center border-dashed p-3 text-center text-sm text-accent">
							<span><Icon name="plus" class="mx-auto" />{m.shelves_add_bookcase()}</span>
						</a>
					</div>
				{:else}
					<a href="/library/c/new?room={loc.id}" class="card flex items-center gap-2 border-dashed p-4 text-sm font-medium text-accent"><Icon name="plus" size={18} />{m.shelves_add_bookcase()}</a>
				{/if}
			</section>
		{/each}

		{#if !data.tree.locations.length}
			<div class="card mb-4 p-5 text-center text-sm text-muted">
				<p class="font-semibold text-ink">{m.shelves_empty_title()}</p>
				<p class="mt-1">{m.shelves_empty_hint()}</p>
			</div>
		{/if}

		{#if adding || !data.tree.locations.length}
			<form method="POST" action="?/addRoom" class="card flex gap-2 p-3">
				<!-- svelte-ignore a11y_autofocus -->
				<input class="input h-11 flex-1" name="name" placeholder={m.shelves_room_placeholder()} required maxlength="80" autofocus={adding} aria-label={m.shelves_room_name()} />
				<button class="btn btn-primary h-11 px-4">{m.shelves_add_room()}</button>
			</form>
			{#if form?.error}<p class="field-error">{form.error}</p>{/if}
		{:else}
			<button class="btn btn-secondary w-full" onclick={() => (adding = true)}><Icon name="plus" size={18} />{m.shelves_add_room()}</button>
		{/if}
	{/if}
</main>
