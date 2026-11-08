<script lang="ts">
	import {
		autoLabel,
		cellsOf,
		evenOut,
		LIMITS,
		moveColumnDivider,
		moveShelfDivider,
		resize,
		setColumnCount,
		setShelfCount,
		type Layout
	} from '@bok/core';
	import Icon from './Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/** Drag the dividers to resize columns and shelves; steppers change counts. */
	let { layout = $bindable(), labels = {} }: { layout: Layout; labels?: Record<string, string> } = $props();

	let svg: SVGSVGElement;
	let drag = $state<{ kind: 'col'; i: number } | { kind: 'shelf'; col: number; j: number } | null>(null);
	let last = 0;
	const cells = $derived(cellsOf(layout));
	const frame = $derived(Math.max(2, Math.min(layout.width, layout.height) * 0.025));
	const handle = $derived(Math.max(4, Math.min(layout.width, layout.height) * 0.045));

	const colX = $derived(layout.columns.reduce<number[]>((acc, c) => [...acc, (acc.at(-1) ?? 0) + c.w], []));

	function toUnits(e: PointerEvent) {
		const pt = svg.createSVGPoint();
		pt.x = e.clientX;
		pt.y = e.clientY;
		const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
		return p;
	}

	function start(e: PointerEvent, d: NonNullable<typeof drag>) {
		e.preventDefault();
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		drag = d;
		const p = toUnits(e);
		last = d.kind === 'col' ? p.x : p.y;
	}

	function move(e: PointerEvent) {
		if (!drag) return;
		const p = toUnits(e);
		const now = drag.kind === 'col' ? p.x : p.y;
		const delta = now - last;
		if (Math.abs(delta) < 0.5) return;
		layout = drag.kind === 'col' ? moveColumnDivider(layout, drag.i, delta) : moveShelfDivider(layout, drag.col, drag.j, delta);
		last = now;
	}

	function end() {
		drag = null;
	}

	const label = (col: number, row: number) => labels[`${col}:${row}`] ?? autoLabel(col, row);
	const fmt = (n: number) => `${Math.round(n)}`;
</script>

<div class="space-y-4">
	<div class="rounded-2xl bg-surface p-3 ring-1 ring-line">
		<svg
			bind:this={svg}
			viewBox="{-frame} {-frame} {layout.width + frame * 2} {layout.height + frame * 2}"
			class="block max-h-[52dvh] w-full touch-none select-none"
			onpointermove={move}
			onpointerup={end}
			onpointercancel={end}
			role="application"
			aria-label={m.designer_canvas()}
		>
			<rect x={-frame} y={-frame} width={layout.width + frame * 2} height={layout.height + frame * 2} rx={frame} class="fill-[#b58a5f] dark:fill-[#5c4630]" />
			{#each cells as c (c.col + ':' + c.row)}
				<rect x={c.x + 0.6} y={c.y + 0.6} width={c.w - 1.2} height={c.h - 1.2} class="fill-[#f3e7d6] dark:fill-[#2c241b]" />
				<text x={c.x + c.w / 2} y={c.y + c.h / 2} text-anchor="middle" dominant-baseline="central" font-size={Math.max(3, Math.min(c.w * 0.3, c.h * 0.4, 12))} font-weight="700" class="fill-ink/60">
					{label(c.col, c.row)}
				</text>
				{#if drag && ((drag.kind === 'shelf' && drag.col === c.col) || drag.kind === 'col')}
					<text x={c.x + c.w / 2} y={c.y + c.h / 2 + Math.min(c.h * 0.3, 8)} text-anchor="middle" font-size={Math.max(2.5, Math.min(c.w * 0.18, 6))} class="fill-accent">
						{drag.kind === 'col' ? `${fmt(c.w)} cm` : `${fmt(c.h)} cm`}
					</text>
				{/if}
			{/each}

			<!-- shelf dividers -->
			{#each layout.columns as col, ci (ci)}
				{#each col.shelves.slice(0, -1) as _, j (j)}
					{@const y = col.shelves.slice(0, j + 1).reduce((a, b) => a + b, 0)}
					{@const x0 = (colX[ci - 1] ?? 0) + 1}
					{@const w = col.w - 2}
					<g class="cursor-row-resize" role="slider" tabindex="0" aria-label={m.designer_shelf_divider({ shelf: label(ci, j) })} aria-valuenow={Math.round(y)}
						onpointerdown={(e) => start(e, { kind: 'shelf', col: ci, j })}
						onkeydown={(e) => {
							if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
								e.preventDefault();
								layout = moveShelfDivider(layout, ci, j, e.key === 'ArrowUp' ? -2 : 2);
							}
						}}
					>
						<rect x={x0} y={y - handle / 2} width={w} height={handle} fill="transparent" />
						<rect x={x0} y={y - 0.9} width={w} height={1.8} class="fill-[#8a6440] dark:fill-[#a07a52]" />
						<rect x={x0 + w / 2 - handle} y={y - handle * 0.28} width={handle * 2} height={handle * 0.56} rx={handle * 0.28}
							class={drag?.kind === 'shelf' && drag.col === ci && drag.j === j ? 'fill-accent' : 'fill-white stroke-accent'} stroke-width="0.6" />
					</g>
				{/each}
			{/each}

			<!-- column dividers -->
			{#each colX.slice(0, -1) as x, i (i)}
				<g class="cursor-col-resize" role="slider" tabindex="0" aria-label={m.designer_column_divider({ n: i + 1 })} aria-valuenow={Math.round(x)}
					onpointerdown={(e) => start(e, { kind: 'col', i })}
					onkeydown={(e) => {
						if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
							e.preventDefault();
							layout = moveColumnDivider(layout, i, e.key === 'ArrowLeft' ? -2 : 2);
						}
					}}
				>
					<rect x={x - handle / 2} y={0} width={handle} height={layout.height} fill="transparent" />
					<rect x={x - 1.2} y={0} width={2.4} height={layout.height} class="fill-[#8a6440] dark:fill-[#a07a52]" />
					<rect x={x - handle * 0.28} y={layout.height / 2 - handle} width={handle * 0.56} height={handle * 2} rx={handle * 0.28}
						class={drag?.kind === 'col' && drag.i === i ? 'fill-accent' : 'fill-white stroke-accent'} stroke-width="0.6" />
				</g>
			{/each}
		</svg>
		<p class="mt-2 text-center text-xs text-muted">{m.designer_drag_hint()}</p>
	</div>

	<div class="card divide-y divide-line/60">
		<div class="flex items-center justify-between px-4 py-3">
			<span class="font-medium">{m.designer_columns()}</span>
			<div class="flex items-center gap-3">
				<button type="button" class="grid size-9 place-items-center rounded-full border border-line" onclick={() => (layout = setColumnCount(layout, layout.columns.length - 1))} disabled={layout.columns.length <= 1} aria-label={m.designer_remove_column()}>−</button>
				<span class="w-5 text-center font-semibold" data-testid="column-count">{layout.columns.length}</span>
				<button type="button" class="grid size-9 place-items-center rounded-full border border-line" onclick={() => (layout = setColumnCount(layout, layout.columns.length + 1))} disabled={layout.columns.length >= LIMITS.maxColumns} aria-label={m.designer_add_column()}>+</button>
			</div>
		</div>
		{#each layout.columns as col, ci (ci)}
			<div class="flex items-center justify-between px-4 py-2.5" data-column={ci}>
				<span class="text-sm">{m.designer_column_shelves({ column: autoLabel(ci, 0).replace(/\d+$/, '') })}</span>
				<div class="flex items-center gap-3">
					<button type="button" class="grid size-9 place-items-center rounded-full border border-line" onclick={() => (layout = setShelfCount(layout, ci, col.shelves.length - 1))} disabled={col.shelves.length <= 1} aria-label={m.designer_remove_shelf()}>−</button>
					<span class="w-5 text-center font-semibold" data-testid="shelf-count">{col.shelves.length}</span>
					<button type="button" class="grid size-9 place-items-center rounded-full border border-line" onclick={() => (layout = setShelfCount(layout, ci, col.shelves.length + 1))} disabled={col.shelves.length >= LIMITS.maxShelves} aria-label={m.designer_add_shelf()}>+</button>
				</div>
			</div>
		{/each}
		<div class="grid grid-cols-2 gap-3 px-4 py-3">
			<label class="text-sm">
				<span class="label">{m.designer_width()}</span>
				<input class="input h-10" type="number" inputmode="numeric" min={LIMITS.minWidth} max={LIMITS.maxWidth} value={Math.round(layout.width)}
					onchange={(e) => (layout = resize(layout, Number(e.currentTarget.value), layout.height))} />
			</label>
			<label class="text-sm">
				<span class="label">{m.designer_height()}</span>
				<input class="input h-10" type="number" inputmode="numeric" min={LIMITS.minHeight} max={LIMITS.maxHeight} value={Math.round(layout.height)}
					onchange={(e) => (layout = resize(layout, layout.width, Number(e.currentTarget.value)))} />
			</label>
		</div>
		<button type="button" class="flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-accent" onclick={() => (layout = evenOut(layout))}>
			<Icon name="refresh" size={16} />{m.designer_even_out()}
		</button>
	</div>
</div>
