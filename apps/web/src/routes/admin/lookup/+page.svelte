<script lang="ts">
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const badge: Record<string, string> = { hit: 'bg-accent text-accent-ink', miss: 'bg-line', error: 'bg-danger text-white', timeout: 'bg-warn text-white' };
</script>

<svelte:head><title>{m.admin_lookup_title()} · bok</title></svelte:head>

<TopBar title={m.admin_lookup_title()} back="/settings" />
<main class="page space-y-6">
	<form method="GET" class="flex gap-2">
		<input class="input flex-1 font-mono" name="code" defaultValue={data.code} placeholder="ISBN / ISSN" inputmode="numeric" />
		<button class="btn btn-primary">{m.scan_lookup()}</button>
	</form>
	<p class="text-xs text-muted">{m.admin_lookup_providers({ list: data.providers.join(', ') })}</p>

	{#if data.invalid}<p class="text-danger">{m.isbn_invalid()}</p>{/if}

	{#if data.result}
		<section class="card space-y-2 p-4">
			<div class="flex items-center justify-between">
				<h2 class="font-semibold">{m.admin_lookup_merged()}</h2>
				<span class="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-semibold">{m.admin_lookup_quality({ score: data.result.quality })}</span>
			</div>
			<pre class="overflow-x-auto rounded-lg bg-bg p-3 text-xs">{JSON.stringify(data.result.merged, null, 2)}</pre>
			<form method="POST" action="?/save">
				<input type="hidden" name="code" defaultValue={data.code} />
				<button class="btn btn-secondary w-full">{m.admin_lookup_save()}</button>
			</form>
			{#if form?.saved}<a class="block text-center text-sm font-semibold text-accent" href="/book/{form.workId}">{m.admin_lookup_saved()}</a>{/if}
		</section>

		{#each data.result.results as r (r.provider)}
			<details class="card p-4">
				<summary class="flex cursor-pointer items-center gap-3">
					<span class="font-semibold">{r.provider}</span>
					<span class="rounded-full px-2 py-0.5 text-xs font-semibold {badge[r.status]}">{r.status}</span>
					<span class="ml-auto text-sm text-muted">{r.ms} ms</span>
				</summary>
				{#if r.error}<p class="mt-2 text-sm text-danger">{r.error}</p>{/if}
				{#if r.record}<pre class="mt-3 overflow-x-auto rounded-lg bg-bg p-3 text-xs">{JSON.stringify(r.record, null, 2)}</pre>{/if}
				{#if r.raw}
					<details class="mt-2">
						<summary class="cursor-pointer text-sm text-muted">raw</summary>
						<pre class="mt-2 max-h-96 overflow-auto rounded-lg bg-bg p-3 text-[11px]">{JSON.stringify(r.raw, null, 2)}</pre>
					</details>
				{/if}
			</details>
		{/each}
	{/if}
</main>
