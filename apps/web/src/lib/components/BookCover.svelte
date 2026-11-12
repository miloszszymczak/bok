<script lang="ts">
	/** Cover image, or a typographic placeholder tinted from the title so shelves stay readable. */
	let {
		src,
		srcset,
		title,
		author = '',
		width = 96,
		eager = false,
		class: cls = ''
	}: { src?: string | null; srcset?: string; title: string; author?: string; width?: number; eager?: boolean; class?: string } = $props();

	let failed = $state(false);
	// A new image gets a fresh chance (the component is reused when lists re-render).
	$effect(() => {
		void src;
		failed = false;
	});
	const hue = $derived([...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
	const sizes = $derived(`${width}px`);
</script>

<div class="relative shrink-0 overflow-hidden rounded-md border-[1.5px] border-outline shadow-[2px_2px_0_var(--outline)] {cls}" style="width:{width}px;aspect-ratio:2/3">
	{#if src && !failed}
		<img
			{src}
			{srcset}
			{sizes}
			alt=""
			loading={eager ? 'eager' : 'lazy'}
			decoding="async"
			class="h-full w-full object-cover"
			onerror={() => (failed = true)}
		/>
	{:else}
		<div class="flex h-full w-full flex-col justify-between p-2 text-[#2b2a24]" style="background:hsl({hue} 34% 76%);box-shadow:inset 0 -{Math.max(4, Math.round(width / 12))}px 0 rgba(46,42,38,0.16)">
			<span class="line-clamp-4 font-serif leading-tight font-semibold" style="font-size:{Math.max(10, width / 8)}px">{title}</span>
			{#if author && width >= 72}<span class="line-clamp-2 pb-1 opacity-80" style="font-size:{Math.max(9, width / 11)}px">{author}</span>{/if}
		</div>
	{/if}
</div>
