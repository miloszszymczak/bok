<script lang="ts">
	import { code128 } from '@bok/core';

	/** Code 128 barcode as crisp SVG (black on white, with quiet zones, for printing and screens). */
	let { value, height = 56, class: cls = '' }: { value: string; height?: number; class?: string } = $props();

	const QUIET = 10;
	const bars = $derived.by(() => {
		const out: { x: number; w: number }[] = [];
		let x = QUIET;
		code128(value).forEach((w, i) => {
			if (i % 2 === 0) out.push({ x, w });
			x += w;
		});
		return { rects: out, width: x + QUIET };
	});
</script>

<svg viewBox="0 0 {bars.width} {height}" preserveAspectRatio="none" class="block bg-white {cls}" role="img" aria-label={value} shape-rendering="crispEdges">
	{#each bars.rects as r (r.x)}<rect x={r.x} y="0" width={r.w} {height} fill="#000" />{/each}
</svg>
