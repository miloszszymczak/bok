<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import BookCover from '#lib/components/BookCover.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { invalidateAll } from '$app/navigation';
	import ReadingPanel from '#lib/components/ReadingPanel.svelte';
	import SectionPicker from '#lib/components/SectionPicker.svelte';
	import ShelfSketch from '#lib/components/ShelfSketch.svelte';
	import { coverVariants } from '#lib/utils/cover-upload.ts';
	import { formatLabel, languageName, roleLabel } from '#lib/utils/labels.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const ed = $derived(data.editions.find((e) => e.id === data.selectedId) ?? data.editions[0]);
	const description = $derived(ed?.description ?? data.work.description);
	let expanded = $state(false);
	let busy = $state(false);
	const authorLine = $derived(data.authors.map((a) => a.name).join(', '));
	let moving = $state<string | null>(null);
	let pickerOpen = $state(false);
	const editionTitle = (id: string) => data.editions.find((e) => e.id === id);

	async function moveCopy(sectionId: string | null) {
		if (!moving) return;
		await fetch('/api/v1/copies/move', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ copyIds: [moving], sectionId }) });
		moving = null;
		await invalidateAll();
	}
	let coverBusy = $state(false);
	let coverError = $state(false);

	async function onCoverPhoto(ev: Event) {
		const file = (ev.currentTarget as HTMLInputElement).files?.[0];
		if (!file || !ed) return;
		coverBusy = true;
		coverError = false;
		try {
			const { s, m: md, l } = await coverVariants(file);
			const body = new FormData();
			body.set('s', s, 's.webp');
			body.set('m', md, 'm.webp');
			body.set('l', l, 'l.webp');
			const res = await fetch(`/api/v1/editions/${ed.id}/cover`, { method: 'POST', body });
			if (!res.ok) throw new Error(String(res.status));
			await invalidateAll();
		} catch {
			coverError = true;
		} finally {
			coverBusy = false;
		}
	}
</script>

<svelte:head>
	<title>{data.work.title}{authorLine ? ` — ${authorLine}` : ''} · bok</title>
	<meta property="og:title" content={data.work.title} />
	{#if description}<meta name="description" content={description.slice(0, 200)} />{/if}
</svelte:head>

<TopBar title="" back={page.data.profile ? '/library' : '/'}>
	{#snippet actions()}
		{#if page.data.profile && ed}
			<a href="/book/{data.work.id}/edit?e={ed.id}" class="btn btn-ghost h-10 px-3 text-sm"><Icon name="pencil" size={18} />{m.book_edit()}</a>
		{/if}
	{/snippet}
</TopBar>
<main class="page">
	{#if page.url.searchParams.get('existed')}<p class="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">{m.add_existed()}</p>{/if}
	{#if page.url.searchParams.get('saved')}<p class="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">{m.edit_saved()}</p>{/if}
	<section class="flex gap-4">
		<div class="shrink-0">
			<BookCover src={ed?.cover} srcset={ed?.srcset ?? undefined} title={data.work.title} author={data.authors[0]?.name} width={128} eager />
			{#if page.data.profile && ed}
				<label class="mt-2 flex cursor-pointer items-center justify-center gap-1 text-xs font-medium text-accent">
					<Icon name="camera" size={14} />{coverBusy ? m.common_loading() : ed.cover ? m.book_replace_cover() : m.book_add_cover()}
					<input type="file" accept="image/*" capture="environment" class="sr-only" onchange={onCoverPhoto} disabled={coverBusy} />
				</label>
				{#if coverError}<p class="mt-1 text-center text-xs text-danger">{m.settings_avatar_failed()}</p>{/if}
			{/if}
		</div>
		<div class="min-w-0 flex-1 pt-1">
			<h1 class="font-serif text-2xl leading-tight font-bold">{ed?.title ?? data.work.title}</h1>
			{#if ed?.subtitle}<p class="mt-1 font-serif text-lg leading-snug text-muted">{ed.subtitle}</p>{/if}
			{#if authorLine}<p class="mt-2 font-medium">{authorLine}</p>{/if}
			{#each data.series as sr (sr.id)}
				{@const me = sr.works.find((w) => w.workId === data.work.id)}
				<a href="/series/{sr.id}" class="mt-1 block text-sm text-accent" data-testid="series-link">{sr.name}{me?.position ? ` #${me.position}` : ''}</a>
			{:else}
				{#if ed?.series}<p class="mt-1 text-sm text-muted">{ed.series.name}{ed.series.position ? ` #${ed.series.position}` : ''}</p>{/if}
			{/each}
			{#if data.work.originalTitle && data.work.originalTitle !== ed?.title}
				<p class="mt-1 text-sm text-muted">{m.book_original_title()}: <span class="italic">{data.work.originalTitle}</span></p>
			{/if}
		</div>
	</section>

	{#if page.data.profile && ed}
		<section class="mt-5">
			<form
				method="POST"
				action="?/addCopy"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update({ reset: false });
						busy = false;
					};
				}}
			>
				<input type="hidden" name="editionId" value={ed.id} />
				{#if ed.owned > 0}
					<div class="flex items-center gap-3">
						<p class="flex flex-1 items-center gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm font-medium"><Icon name="check" size={18} class="text-accent" />{m.book_in_library({ count: ed.owned })}</p>
						<button class="btn btn-secondary h-11 px-4" disabled={busy} aria-label={m.book_add_another()}><Icon name="plus" size={18} /></button>
					</div>
				{:else}
					<button class="btn btn-primary w-full" disabled={busy}><Icon name="plus" size={20} />{m.book_add_to_library()}</button>
				{/if}
				{#if form?.added}<p class="mt-2 text-center text-sm text-accent" role="status">{m.book_added()}</p>{/if}
			</form>
		</section>
	{/if}

	{#if data.reading}
		<div class="mt-5">
			<ReadingPanel title={data.work.title} status={data.reading.status} stuckSource={data.reading.stuckSource} current={data.reading.current} events={data.reading.events} past={data.reading.past} pages={ed?.pageCount ?? null} medianRate={data.medianRate} openFinish={data.openFinish} />
		</div>
	{/if}

	{#if data.myCopies.length}
		<section class="mt-6" data-testid="where">
			<h2 class="section-title">{m.where_title()}</h2>
			<div class="space-y-3">
				{#each data.myCopies as c (c.copyId)}
					<div class="card p-3" data-copy={c.copyId}>
						<div class="flex items-start gap-3">
							{#if c.sketch && c.place}
								<a href="/library/s/{c.place.sectionId}" class="w-28 shrink-0"><ShelfSketch layout={c.sketch.layout} sections={c.sketch.sections} highlight={[c.place.sectionId]} books={false} title={c.place.containerName} /></a>
							{/if}
							<div class="min-w-0 flex-1">
								{#if c.place}
									<p class="text-sm text-muted">{c.place.locationName} › {c.place.containerName}</p>
									<p class="font-serif text-2xl font-bold" data-testid="where-label">{c.place.label}</p>
								{:else}
									<p class="font-semibold text-warn">{m.shelves_unsorted()}</p>
									<p class="text-sm text-muted">{m.where_unsorted_hint()}</p>
								{/if}
								{#if data.editions.length > 1}<p class="mt-1 truncate text-xs text-muted">{editionTitle(c.editionId)?.publisher} {editionTitle(c.editionId)?.publishedYear ?? ''}</p>{/if}
								{#if c.state === 'lent'}<p class="mt-1 text-xs font-semibold text-warn">{m.where_lent()}</p>{/if}
								<button class="btn btn-secondary mt-2 h-9 px-3 text-sm" onclick={() => ((moving = c.copyId), (pickerOpen = true))}>{c.place ? m.where_move() : m.where_put()}</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#each data.series as sr (sr.id)}
		{@const idx = sr.works.findIndex((w) => w.workId === data.work.id)}
		{@const next = idx >= 0 ? sr.works[idx + 1] : undefined}
		{#if next}
			<a href="/book/{next.workId}" class="card mt-4 flex items-center gap-3 p-3" data-testid="next-in-series">
				<BookCover src={next.cover} title={next.title} width={36} />
				<span class="min-w-0 flex-1"><span class="block text-xs text-muted">{m.series_next({ series: sr.name })}</span><span class="block truncate font-medium">{next.title}</span></span>
				<Icon name="forward" size={16} class="text-muted" />
			</a>
		{/if}
	{/each}

	{#if page.data.profile || data.tags.community.length}
		<section class="mt-5" data-testid="tags">
			<div class="flex flex-wrap items-center gap-1.5">
				{#each data.tags.mine as t (t.slug)}
					<form method="POST" action="?/removeTag" use:enhance class="contents">
						<input type="hidden" name="slug" value={t.slug} />
						<button class="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent" title={m.tags_remove()}>#{t.name} ×</button>
					</form>
				{/each}
				{#each data.tags.community.filter((c) => !data.tags.mine.some((x) => x.slug === c.slug)) as t (t.slug)}
					{#if page.data.profile}
						<form method="POST" action="?/addTag" use:enhance class="contents">
							<input type="hidden" name="tag" value={t.name} />
							<button class="rounded-full border border-line px-2.5 py-1 text-xs text-muted" title={m.tags_add_this()}>#{t.name} <span class="opacity-70">{t.count}</span></button>
						</form>
					{:else}
						<span class="rounded-full border border-line px-2.5 py-1 text-xs text-muted">#{t.name} {t.count}</span>
					{/if}
				{/each}
				{#if page.data.profile}
					<form method="POST" action="?/addTag" use:enhance={() => async ({ update }) => update()} class="flex items-center">
						<input name="tag" class="h-7 w-28 rounded-full border-line bg-surface px-3 text-xs" placeholder={m.tags_add()} maxlength="40" aria-label={m.tags_add()} autocomplete="off" />
					</form>
				{/if}
			</div>
		</section>
	{/if}

	{#if description}
		<section class="mt-6">
			<p class="leading-relaxed whitespace-pre-line {expanded ? '' : 'line-clamp-5'}">{description}</p>
			{#if description.length > 280}
				<button class="mt-1 text-sm font-semibold text-accent" onclick={() => (expanded = !expanded)}>{expanded ? m.common_less() : m.common_more()}</button>
			{/if}
		</section>
	{/if}

	{#if ed}
		<section class="mt-6">
			<h2 class="section-title">{m.book_details()}</h2>
			<dl class="card divide-y divide-line/60 text-sm">
				{#each [[m.book_publisher(), ed.publisher], [m.book_published(), ed.publishedDate ?? ed.publishedYear], [m.book_pages(), ed.pageCount], [m.book_language(), languageName(ed.language)], [m.book_format(), formatLabel(ed.format)], [m.book_edition(), ed.editionStatement], ['ISBN', ed.isbn13], ['ISSN', ed.issn]] as [label, value] (label)}
					{#if value}
						<div class="flex justify-between gap-4 px-4 py-3"><dt class="text-muted">{label}</dt><dd class="text-right font-medium">{value}</dd></div>
					{/if}
				{/each}
				{#each ed.contributors as c (c.name + c.role)}
					<div class="flex justify-between gap-4 px-4 py-3"><dt class="text-muted">{roleLabel(c.role)}</dt><dd class="text-right font-medium">{c.name}</dd></div>
				{/each}
			</dl>
		</section>
	{/if}

	{#if data.editions.length > 1}
		<section class="mt-6">
			<h2 class="section-title">{m.book_editions({ count: data.editions.length })}</h2>
			<div class="card divide-y divide-line/60">
				{#each data.editions as e (e.id)}
					<a href="?e={e.id}" class="flex items-center gap-3 px-4 py-3 text-sm {e.id === ed?.id ? 'bg-accent-soft/60' : ''}" data-sveltekit-replacestate data-sveltekit-noscroll>
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium">{e.title}</p>
							<p class="truncate text-muted">{[e.publisher, e.publishedYear, languageName(e.language)].filter(Boolean).join(' · ')}</p>
						</div>
						{#if e.owned}<Icon name="check" size={18} class="text-accent" />{/if}
					</a>
				{/each}
			</div>
		</section>
	{/if}
</main>

<SectionPicker tree={data.tree} bind:open={pickerOpen} title={m.list_move_to()} current={data.myCopies.find((c) => c.copyId === moving)?.place?.sectionId ?? null} allowUnsorted onpick={moveCopy} />
