<script lang="ts">
	import { enhance } from '$app/forms';
	import TopBar from '#lib/components/TopBar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { importStatusLabel } from '#lib/utils/imports.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	let fileName = $state('');
	let guide = $state<'goodreads' | 'lubimyczytac' | null>(null);
	const errorText = (e: string) => (e === 'too_large' ? m.import_err_too_large() : e === 'no_title_column' ? m.import_err_columns() : e === 'too_many_rows' ? m.import_err_rows() : e === 'rate' ? m.import_err_rate() : m.import_err_empty());
</script>

<svelte:head><title>{m.import_title()} · bok</title></svelte:head>

<TopBar title={m.import_title()} back="/settings#data" />
<main class="page space-y-6">
	<form method="POST" action="?/upload" enctype="multipart/form-data" class="card space-y-3 p-4" use:enhance={() => { busy = true; return async ({ update }) => { await update(); busy = false; }; }}>
		<p class="text-sm">{m.import_intro()}</p>
		<label class="flex items-center gap-3">
			<input type="file" name="file" accept=".csv,text/csv" required class="peer sr-only" data-testid="import-file" onchange={(e) => (fileName = e.currentTarget.files?.[0]?.name ?? '')} />
			<span class="btn btn-secondary h-10 shrink-0 cursor-pointer px-3 text-sm peer-focus-visible:outline-3 peer-focus-visible:outline-accent-text">{m.import_choose_file()}</span>
			<span class="min-w-0 truncate text-sm {fileName ? 'font-semibold' : 'text-muted'}">{fileName || m.import_no_file()}</span>
		</label>
		{#if form?.error}<p class="text-sm text-danger" role="alert">{errorText(form.error)}</p>{/if}
		<button class="btn btn-primary w-full" disabled={busy} data-testid="import-upload">{busy ? m.common_loading() : m.import_upload()}</button>
		<p class="text-xs text-muted">{m.import_nothing_yet()}</p>
	</form>

	<section class="space-y-2">
		<h2 class="section-title">{m.import_how()}</h2>
		<div class="card divide-y divide-line/60">
			<button class="flex w-full items-center justify-between px-4 py-3 text-left font-medium" onclick={() => (guide = guide === 'goodreads' ? null : 'goodreads')} aria-expanded={guide === 'goodreads'}>Goodreads<Icon name="forward" size={16} class="text-muted transition {guide === 'goodreads' ? 'rotate-90' : ''}" /></button>
			{#if guide === 'goodreads'}<ol class="list-decimal space-y-1 px-4 py-3 pl-8 text-sm"><li>{m.import_gr_1()}</li><li>{m.import_gr_2()}</li><li>{m.import_gr_3()}</li></ol>{/if}
			<button class="flex w-full items-center justify-between px-4 py-3 text-left font-medium" onclick={() => (guide = guide === 'lubimyczytac' ? null : 'lubimyczytac')} aria-expanded={guide === 'lubimyczytac'} data-testid="guide-lc">lubimyczytac.pl<Icon name="forward" size={16} class="text-muted transition {guide === 'lubimyczytac' ? 'rotate-90' : ''}" /></button>
			{#if guide === 'lubimyczytac'}
				<div class="space-y-2 px-4 py-3 text-sm">
					<p>{m.import_lc_1()}</p>
					<p>{m.import_lc_2()}</p>
					<p class="text-muted">{m.import_lc_3()}</p>
				</div>
			{/if}
		</div>
	</section>

	{#if data.imports.length}
		<section>
			<h2 class="section-title">{m.import_previous()}</h2>
			<ul class="card divide-y divide-line/60">
				{#each data.imports as i (i.id)}
					<li><a href="/import/{i.id}" class="flex items-center gap-3 px-4 py-3 text-sm"><span class="min-w-0 flex-1"><span class="block truncate font-medium">{i.fileName || i.source}</span><span class="text-xs text-muted">{new Date(i.createdAt).toLocaleDateString()} · {importStatusLabel(i.status)}</span></span><span class="text-muted">{i.stats.total}</span></a></li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
