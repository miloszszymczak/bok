<script lang="ts">
	import Barcode from '#lib/components/Barcode.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{m.labels_title()} · bok</title></svelte:head>

<div class="print:hidden">
	<TopBar title={m.labels_title()} back={data.back}>
		{#snippet actions()}
			{#if data.labels.length}<button class="btn btn-primary h-10 px-4 text-sm" onclick={() => print()} data-testid="print-labels"><Icon name="printer" size={18} />{m.labels_print()}</button>{/if}
		{/snippet}
	</TopBar>
</div>
<main class="page print:max-w-none print:p-0">
	<p class="mb-4 px-1 text-sm text-muted print:hidden">{m.labels_hint()}</p>
	{#if data.labels.length}
		<ul class="labels grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-0" data-testid="labels">
			{#each data.labels as l (l.sectionId)}
				<li class="label flex flex-col gap-1.5 rounded-lg border-2 border-dashed border-line bg-white p-3 text-[#2b2a24] print:rounded-none print:border-[#999]" data-code={l.code} data-section={l.sectionId} data-label={l.label}>
					<div class="flex items-baseline justify-between gap-2">
						<span class="font-serif text-2xl leading-none font-bold">{l.label}</span>
						<span class="truncate text-xs">{l.locationName} · {l.containerName}</span>
					</div>
					<Barcode value={l.code} height={48} class="h-14 w-full" />
					<span class="text-center font-mono text-xs tracking-widest">{l.code}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="card p-6 text-center text-sm text-muted">{m.labels_empty()}</p>
	{/if}
</main>

<style>
	@media print {
		@page {
			size: A4;
			margin: 10mm;
		}
		.label {
			break-inside: avoid;
			height: 38mm;
			justify-content: center;
		}
	}
</style>
