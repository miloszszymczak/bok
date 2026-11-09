<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { booksText } from '#lib/utils/reading.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let live = $state<typeof data.imp | null>(null);
	const imp = $derived(live && live.id === data.imp.id ? live : data.imp);
	const running = $derived(imp.status === 'queued' || imp.status === 'running');
	const pct = $derived(imp.stats.total ? Math.round((imp.stats.processed / imp.stats.total) * 100) : 0);
	let scale = $state<'5' | '10'>('5');
	$effect.pre(() => {
		scale = String(data.imp.options.ratingScale) as '5' | '10';
	});

	// Live progress: poll while the worker runs, then reload the report.
	onMount(() => {
		const t = setInterval(async () => {
			if (!running) return;
			const r = await fetch(`/api/v1/imports/${data.imp.id}`);
			if (!r.ok) return;
			live = await r.json();
			if (live && !['queued', 'running'].includes(live.status)) await invalidateAll();
		}, 1200);
		return () => clearInterval(t);
	});
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
		await update({ reset: false });
		live = null;
	};
	const shelfLabel = (s: string) => (s === 'read' ? m.import_shelf_read() : s === 'reading' ? m.import_shelf_reading() : s === 'want_to_read' ? m.import_shelf_want() : m.import_shelf_dnf());
</script>

<svelte:head><title>{m.import_title()} · bok</title></svelte:head>

<TopBar title={imp.fileName || m.import_title()} back="/import" />
<main class="page space-y-5" data-testid="import" data-status={imp.status}>
	{#if imp.status === 'preview' && data.preview}
		{@const s = data.preview.summary}
		<section class="card space-y-3 p-4" data-testid="import-preview">
			<p class="text-sm text-muted">{imp.source === 'goodreads' ? m.import_detected_gr() : imp.source === 'lubimyczytac' ? m.import_detected_lc() : m.import_detected_generic()}</p>
			<p class="font-serif text-3xl font-bold">{booksText(s.total)}</p>
			<dl class="grid grid-cols-2 gap-2 text-sm">
				<div><dt class="text-muted">{m.import_shelf_read()}</dt><dd class="font-semibold">{s.read}</dd></div>
				<div><dt class="text-muted">{m.import_shelf_reading()}</dt><dd class="font-semibold">{s.reading}</dd></div>
				<div><dt class="text-muted">{m.import_shelf_want()}</dt><dd class="font-semibold">{s.wantToRead}</dd></div>
				<div><dt class="text-muted">{m.import_shelf_dnf()}</dt><dd class="font-semibold">{s.dnf}</dd></div>
				<div><dt class="text-muted">{m.import_with_isbn()}</dt><dd class="font-semibold">{s.withIsbn}</dd></div>
				<div><dt class="text-muted">{m.import_rated()}</dt><dd class="font-semibold">{s.rated}</dd></div>
				<div><dt class="text-muted">{m.import_reviews()}</dt><dd class="font-semibold">{s.reviews}</dd></div>
				<div><dt class="text-muted">{m.import_owned()}</dt><dd class="font-semibold">{s.owned}</dd></div>
			</dl>
			{#if data.preview.sample.length}
				<ul class="divide-y divide-line/60 rounded-xl border border-line text-sm">
					{#each data.preview.sample as r (r.line)}<li class="flex justify-between gap-2 px-3 py-2"><span class="min-w-0 truncate">{r.title} <span class="text-muted">· {r.authors[0] ?? ''}</span></span><span class="shrink-0 text-muted">{r.shelf ? shelfLabel(r.shelf) : ''}{r.rating ? ` · ${r.rating}` : ''}</span></li>{/each}
				</ul>
			{/if}
		</section>

		<form method="POST" action="?/confirm" use:enhance={keep} class="card space-y-4 p-4">
			<fieldset>
				<legend class="mb-1 text-sm font-semibold">{m.import_scale()}</legend>
				<p class="mb-2 text-xs text-muted">{m.import_scale_hint({ values: data.preview.ratings.slice(0, 12).join(', ') || '—' })}</p>
				<div class="flex gap-2">
					<label class="flex-1 cursor-pointer rounded-xl border px-3 py-2 text-sm {scale === '5' ? 'border-accent bg-accent-soft' : 'border-line'}"><input type="radio" name="ratingScale" value="5" bind:group={scale} class="sr-only" />{m.import_scale_5()}</label>
					<label class="flex-1 cursor-pointer rounded-xl border px-3 py-2 text-sm {scale === '10' ? 'border-accent bg-accent-soft' : 'border-line'}" data-testid="scale-10"><input type="radio" name="ratingScale" value="10" bind:group={scale} class="sr-only" />{m.import_scale_10()}</label>
				</div>
			</fieldset>
			{#if s.shelves.length}
				<div>
					<label class="label" for="shelvesAs">{m.import_shelves_as({ shelves: s.shelves.slice(0, 4).map((x) => x.name).join(', ') })}</label>
					<select class="input" id="shelvesAs" name="shelvesAs"><option value="tags">{m.import_as_tags()}</option><option value="readlists">{m.import_as_lists()}</option><option value="none">{m.import_as_none()}</option></select>
				</div>
			{/if}
			<div>
				<label class="label" for="visibility">{m.import_visibility()}</label>
				<select class="input" id="visibility" name="visibility" value={imp.options.visibility}>
					<option value="public">{m.visibility_public()}</option><option value="followers">{m.visibility_followers()}</option><option value="friends">{m.visibility_friends()}</option><option value="private">{m.visibility_private()}</option>
				</select>
				<p class="mt-1 text-xs text-muted">{m.import_not_in_feed()}</p>
			</div>
			{#if s.owned}<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="copies" checked class="size-4 rounded border-line text-accent focus:ring-accent" />{m.import_copies({ count: s.owned })}</label>{/if}
			<button class="btn btn-primary w-full" data-testid="import-confirm">{m.import_start()}</button>
		</form>
		<form method="POST" action="?/cancel" use:enhance={keep}><button class="btn btn-ghost w-full text-sm">{m.common_cancel()}</button></form>
	{:else if running}
		<section class="card space-y-3 p-4" data-testid="import-progress">
			<p class="font-semibold">{m.import_running()}</p>
			<div class="h-3 overflow-hidden rounded-full bg-line/60"><div class="h-full rounded-full bg-accent transition-all" style="width: {pct}%"></div></div>
			<p class="text-sm text-muted">{m.import_progress({ done: imp.stats.processed, total: imp.stats.total })}</p>
			<p class="text-xs text-muted">{m.import_can_leave()}</p>
			<form method="POST" action="?/cancel" use:enhance={keep}><button class="btn btn-secondary h-10 text-sm">{m.import_stop()}</button></form>
		</section>
	{:else if imp.status === 'done'}
		<section class="card space-y-3 p-4" data-testid="import-report">
			<p class="font-serif text-2xl font-bold">{m.import_done()}</p>
			<dl class="grid grid-cols-2 gap-2 text-sm">
				<div><dt class="text-muted">{m.import_matched()}</dt><dd class="text-lg font-semibold" data-testid="stat-matched">{imp.stats.matched}</dd></div>
				<div><dt class="text-muted">{m.import_created()}</dt><dd class="text-lg font-semibold" data-testid="stat-created">{imp.stats.created}</dd></div>
				<div><dt class="text-muted">{m.import_review()}</dt><dd class="text-lg font-semibold" data-testid="stat-review">{imp.stats.review}</dd></div>
				<div><dt class="text-muted">{m.import_failed()}</dt><dd class="text-lg font-semibold">{imp.stats.failed}</dd></div>
			</dl>
			<a href="/library" class="btn btn-secondary w-full">{m.import_open_library()}</a>
		</section>
		{#if data.review.length}
			<section>
				<h2 class="section-title">{m.import_review_title()}</h2>
				<div class="space-y-3" data-testid="review-rows">
					{#each data.review as rv (rv.id)}
						<form method="POST" action="?/resolve" use:enhance={keep} class="card space-y-2 p-3" data-review-row={rv.line}>
							<input type="hidden" name="rowId" value={rv.id} />
							<p class="text-sm"><span class="font-medium">{rv.row.title}</span> <span class="text-muted">· {rv.row.authors.join(', ')}</span></p>
							<p class="text-xs text-muted">{m.import_is_it()}</p>
							{#each rv.candidates as c (c.workId)}
								<button name="choice" value={c.workId} class="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2 text-left text-sm hover:border-accent" data-testid="pick-candidate"><span class="min-w-0 truncate">{c.title} <span class="text-muted">· {c.authors.join(', ')}</span></span></button>
							{/each}
							<div class="flex gap-2"><button name="choice" value="create" class="btn btn-secondary h-9 flex-1 text-sm">{m.import_new_record()}</button><button name="choice" value="skip" class="btn btn-ghost h-9 text-sm">{m.import_skip()}</button></div>
						</form>
					{/each}
				</div>
			</section>
		{/if}
		{#if data.failed.length}
			<section>
				<h2 class="section-title">{m.import_failed()}</h2>
				<ul class="card divide-y divide-line/60 text-sm">{#each data.failed as f (f.id)}<li class="px-3 py-2">{m.import_line({ line: f.line })}: {f.title}</li>{/each}</ul>
			</section>
		{/if}
	{:else}
		<p class="card p-4 text-sm text-muted">{imp.status === 'failed' ? m.import_status_failed() : m.import_status_cancelled()}</p>
	{/if}
</main>
