<script lang="ts" module>
	export interface SketchSection {
		id: string;
		x: number;
		y: number;
		w: number;
		h: number;
		label: string;
		count?: number;
	}
</script>

<script lang="ts">
	import type { Layout } from '@bok/core';

	/**
	 * Read-only drawing of a bookcase: shelves as cells, books as spines, the highlighted
	 * shelf(s) in the accent colour. Optional `onpick` makes cells tappable.
	 */
	let {
		layout,
		sections,
		highlight = [],
		onpick,
		labels = true,
		books = true,
		class: cls = '',
		title = ''
	}: {
		layout: Layout;
		sections: SketchSection[];
		highlight?: string[];
		onpick?: (id: string) => void;
		labels?: boolean;
		books?: boolean;
		class?: string;
		title?: string;
	} = $props();

	const frame = $derived(Math.max(2, Math.min(layout.width, layout.height) * 0.025));
	const hi = $derived(new Set(highlight));

	// Deterministic "random" spine heights so a shelf looks the same every time.
	function spines(s: SketchSection) {
		const n = Math.min(s.count ?? 0, Math.floor((s.w - 2) / 2.6));
		let seed = [...s.id].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);
		const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
		const out: { x: number; w: number; h: number; tone: number }[] = [];
		let x = s.x + 1;
		for (let i = 0; i < n; i++) {
			const w = 1.6 + rnd() * 1.4;
			if (x + w > s.x + s.w - 1) break;
			out.push({ x, w, h: Math.min(s.h - 1.5, s.h * (0.55 + rnd() * 0.35)), tone: Math.floor(rnd() * 4) });
			x += w + 0.25;
		}
		return out;
	}
</script>

<svg
	viewBox="{-frame} {-frame} {layout.width + frame * 2} {layout.height + frame * 2}"
	class="block h-auto w-full {cls}"
	role={onpick ? 'group' : 'img'}
	aria-label={title}
	preserveAspectRatio="xMidYMid meet"
>
	<rect x={-frame} y={-frame} width={layout.width + frame * 2} height={layout.height + frame * 2} rx={frame} class="fill-[#b58a5f] dark:fill-[#5c4630]" />
	{#each sections as s (s.id)}
		{@const on = hi.has(s.id)}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
		<g
			role={onpick ? 'button' : 'presentation'}
			tabindex={onpick ? 0 : -1}
			aria-label={onpick ? s.label : undefined}
			class={onpick ? 'cursor-pointer' : ''}
			onclick={() => onpick?.(s.id)}
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onpick?.(s.id)}
		>
			<rect x={s.x + 0.6} y={s.y + 0.6} width={Math.max(0, s.w - 1.2)} height={Math.max(0, s.h - 1.2)} class={on ? 'fill-accent' : 'fill-[#f3e7d6] dark:fill-[#2c241b]'} />
			{#if books && !on}
				{#each spines(s) as b, i (i)}
					<rect x={b.x} y={s.y + s.h - 0.6 - b.h} width={b.w} height={b.h} rx="0.3" class={['fill-[#8c4a3b]', 'fill-[#3f5f73]', 'fill-[#5d6b3e]', 'fill-[#a8803f]'][b.tone]} opacity="0.85" />
				{/each}
			{/if}
			{#if labels}
				<text
					x={s.x + s.w / 2}
					y={s.y + s.h / 2}
					text-anchor="middle"
					dominant-baseline="central"
					font-size={Math.max(3, Math.min(s.w * 0.32, s.h * 0.45, 14))}
					font-weight="700"
					class={on ? 'fill-accent-ink' : 'fill-ink/70'}
					paint-order="stroke"
					stroke={on ? 'none' : 'var(--surface)'}
					stroke-width={on ? 0 : 1.2}
				>{s.label}</text>
			{/if}
		</g>
	{/each}
</svg>
