<script lang="ts">
	/** Read-only 0–10 rating as ★ with halves. */
	let { value, size = 14 }: { value: number | null; size?: number } = $props();
</script>

{#if value !== null}
	<span class="inline-flex items-center text-warn" aria-label="{value}/10" title="{value}/10">
		{#each [1, 2, 3, 4, 5] as s (s)}
			<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
				<defs><clipPath id="hs{s}"><rect width="12" height="24" /></clipPath></defs>
				<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" class="fill-line" />
				{#if value >= s * 2}<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="currentColor" />
				{:else if value === s * 2 - 1}<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="currentColor" clip-path="url(#hs{s})" />{/if}
			</svg>
		{/each}
	</span>
{/if}
