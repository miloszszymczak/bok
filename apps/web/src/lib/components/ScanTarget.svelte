<script lang="ts">
	import Icon from './Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { Place } from '#lib/client/library-cache.ts';

	/** "Salon › Billy 2 › C3" + Next shelf. Null target = books go to Unsorted. */
	let { place, onpick, onnext, isLast }: { place: Place | null; onpick: () => void; onnext: () => void; isLast: boolean } = $props();
</script>

<div class="flex items-center gap-2 px-4 pb-2" data-testid="scan-target">
	<button class="card flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left" onclick={onpick}>
		<Icon name="library" size={18} class="shrink-0 text-accent" />
		<span class="min-w-0 flex-1 truncate text-sm">
			{#if place}
				<span class="text-muted">{`${place.locationName} › ${place.containerName} › `}</span><span class="font-bold" data-testid="target-label">{place.label}</span>
			{:else}
				<span class="text-muted">{m.scan_target_none()}</span>
			{/if}
		</span>
		<Icon name="forward" size={16} class="shrink-0 rotate-90 text-muted" />
	</button>
	{#if place}
		<button class="btn btn-primary h-11 shrink-0 px-3 text-sm" onclick={onnext} disabled={isLast} data-testid="next-shelf">{isLast ? m.scan_last_shelf() : m.scan_next_shelf()} →</button>
	{/if}
</div>
