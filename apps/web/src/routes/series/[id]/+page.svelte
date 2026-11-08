<script lang="ts">
	import BookRow from '#lib/components/BookRow.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { statusLabel, statusTone, type Status } from '#lib/utils/reading.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.series.name} · bok</title></svelte:head>

<TopBar title={data.series.name} back="/library" />
<main class="page">
	<p class="mb-3 px-1 text-sm text-muted">{m.series_count({ count: data.series.works.length })}</p>
	<div class="card divide-y divide-line/60 p-1">
		{#each data.series.works as w (w.workId)}
			<BookRow href="/book/{w.workId}" title={w.title} meta={[w.position ? `#${w.position}` : '', w.year].filter(Boolean).join(' · ')} cover={w.cover}>
				{#snippet trailing()}
					{#if w.status}<span class="rounded-full px-2.5 py-1 text-xs font-semibold {statusTone(w.status as Status)}">{statusLabel(w.status as Status)}</span>{/if}
				{/snippet}
			</BookRow>
		{/each}
	</div>
</main>
