<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';

	/** 5 stars with halves → 1..10 (0–10 scale); empty = unrated. */
	let { value = $bindable<number | null>(null), name = 'rating' }: { value?: number | null; name?: string } = $props();
	let hover = $state<number | null>(null);
	const shown = $derived(hover ?? value ?? 0);
</script>

<div class="flex items-center gap-3">
	<div class="flex" role="group" aria-label={m.rating_label()} onpointerleave={() => (hover = null)}>
		{#each [1, 2, 3, 4, 5] as star (star)}
			<span class="relative size-10">
				<svg viewBox="0 0 24 24" class="absolute inset-0 size-10" aria-hidden="true">
					<defs>
						<clipPath id="half-{name}-{star}"><rect x="0" y="0" width="12" height="24" /></clipPath>
					</defs>
					<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" class="fill-line stroke-line" stroke-width="1" />
					{#if shown >= star * 2}
						<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" class="fill-warn stroke-warn" stroke-width="1" />
					{:else if shown === star * 2 - 1}
						<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" class="fill-warn stroke-warn" stroke-width="1" clip-path="url(#half-{name}-{star})" />
					{/if}
				</svg>
				<button type="button" class="absolute inset-y-0 left-0 w-1/2" role="radio" aria-checked={value === star * 2 - 1} aria-label={m.rating_value({ stars: star - 0.5 })}
					onpointerenter={() => (hover = star * 2 - 1)} onclick={() => (value = value === star * 2 - 1 ? null : star * 2 - 1)}></button>
				<button type="button" class="absolute inset-y-0 right-0 w-1/2" role="radio" aria-checked={value === star * 2} aria-label={m.rating_value({ stars: star })}
					onpointerenter={() => (hover = star * 2)} onclick={() => (value = value === star * 2 ? null : star * 2)}></button>
			</span>
		{/each}
	</div>
	<span class="w-14 text-sm font-semibold" data-testid="rating-value">{value === null ? m.rating_none() : `${value}/10`}</span>
	<input type="hidden" {name} value={value ?? ''} />
</div>
