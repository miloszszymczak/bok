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
	import { isSingleCompartment, type Layout } from '@bok/core';

	/**
	 * Read-only drawing of a storage place: a bookcase or nightstand as cells with books as spines,
	 * or a pile / box / e-book reader as a picture of one. The highlighted shelf(s) are in the
	 * accent colour. Optional `onpick` makes cells (or the whole picture) tappable.
	 */
	let {
		layout,
		sections,
		kind = 'bookcase',
		highlight = [],
		onpick,
		labels = true,
		books = true,
		class: cls = '',
		title = ''
	}: {
		layout: Layout;
		sections: SketchSection[];
		kind?: string;
		highlight?: string[];
		onpick?: (id: string) => void;
		labels?: boolean;
		books?: boolean;
		class?: string;
		title?: string;
	} = $props();

	const frame = $derived(Math.max(2, Math.min(layout.width, layout.height) * 0.025));
	const single = $derived(isSingleCompartment(kind));
	const only = $derived(sections[0]);
	/** Nightstands stand on legs. */
	const legs = $derived(kind === 'nightstand' ? layout.height * 0.12 : 0);
	const TONES = ['fill-[#8c4a3b]', 'fill-[#3f5f73]', 'fill-[#5d6b3e]', 'fill-[#a8803f]'];

	function seeded(id: string) {
		let seed = [...id].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);
		return () => ((seed = (seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
	}
	/** Books of a pile, bottom to top. */
	function pileBooks(s: SketchSection) {
		const rnd = seeded(s.id);
		const n = Math.max(3, Math.min(7, s.count ?? 0));
		return Array.from({ length: n }, (_, i) => {
			const w = 56 + rnd() * 26;
			return { x: 50 - w / 2 + (rnd() - 0.5) * 8, y: 90 - (i + 1) * 10.5, w, tone: Math.floor(rnd() * 4) };
		});
	}
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

{#if single && only}
	{@const on = hi.has(only.id)}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
	<svg viewBox="0 0 100 100" class="block h-auto w-full {cls}" role={onpick ? 'button' : 'img'} aria-label={title} tabindex={onpick ? 0 : -1}
		onclick={() => onpick?.(only.id)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onpick?.(only.id)} data-kind={kind}>
		<g class="stroke-[#2b2a24] dark:stroke-[#141815] {onpick ? 'cursor-pointer' : ''}" stroke-width="2.2" stroke-linejoin="round">
			{#if kind === 'pile'}
				<rect x="12" y="90" width="76" height="4" rx="2" class="fill-[#8a6440] dark:fill-[#4a3826]" stroke="none" opacity="0.5" />
				{#each pileBooks(only) as b, i (i)}
					<rect x={b.x} y={b.y} width={b.w} height="10" rx="1.5" class={on ? 'fill-accent' : TONES[b.tone]} />
					<path d="M{b.x + b.w - 7} {b.y + 2.5}v5" stroke-width="1.4" class="stroke-[#f3e7d6]" opacity={on ? 0 : 0.7} />
				{/each}
			{:else if kind === 'ereader'}
				<rect x="24" y="6" width="52" height="88" rx="8" class="fill-[#3a3f44] dark:fill-[#2a2e32]" />
				<rect x="30" y="13" width="40" height="64" rx="2" class={on ? 'fill-accent' : 'fill-[#f3efe4] dark:fill-[#d9d4c7]'} />
				{#each [22, 29, 36, 43, 50, 57, 64] as y, i (y)}<path d="M35 {y}h{i % 3 === 2 ? 18 : 30}" stroke-width="1.6" class="stroke-[#8a857a]" />{/each}
				<circle cx="50" cy="85.5" r="3.2" class="fill-[#5a6067]" stroke-width="1.6" />
			{:else}
				<!-- box (and anything else): an open carton, books peeking out when it holds some -->
				{#if (only.count ?? 0) > 0}
					{#each [0, 1, 2, 3].slice(0, Math.min(4, only.count ?? 0)) as i (i)}
						<rect x={26 + i * 12} y={28 + (i % 2) * 6} width="9" height="24" rx="1" class={TONES[i % 4]} stroke-width="1.6" />
					{/each}
				{/if}
				<path d="M14 42 L4 30 L30 30 L36 42 Z" class="fill-[#b78550] dark:fill-[#7a5a38]" />
				<path d="M86 42 L96 30 L70 30 L64 42 Z" class="fill-[#b78550] dark:fill-[#7a5a38]" />
				<rect x="14" y="42" width="72" height="50" rx="2" class={on ? 'fill-accent' : 'fill-[#c99a62] dark:fill-[#8a6845]'} />
				<path d="M14 54h72" stroke-width="1.4" opacity="0.35" />
			{/if}
		</g>
	</svg>
{:else}
<svg
	viewBox="{-frame} {-frame} {layout.width + frame * 2} {layout.height + frame * 2 + legs}"
	class="block h-auto w-full {cls}"
	role={onpick ? 'group' : 'img'}
	aria-label={title}
	preserveAspectRatio="xMidYMid meet"
>
	{#if legs}
		<rect x={-frame * 0.2} y={layout.height + frame * 0.5} width={frame * 2.2} height={legs + frame * 0.5} class="fill-[#8a6440] dark:fill-[#4a3826]" />
		<rect x={layout.width - frame * 2} y={layout.height + frame * 0.5} width={frame * 2.2} height={legs + frame * 0.5} class="fill-[#8a6440] dark:fill-[#4a3826]" />
	{/if}
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
					<rect x={b.x} y={s.y + s.h - 0.6 - b.h} width={b.w} height={b.h} rx="0.3" class={TONES[b.tone]} opacity="0.85" />
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
{/if}
