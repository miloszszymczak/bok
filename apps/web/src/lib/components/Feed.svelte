<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { FeedItem as Item } from '@bok/server';
	import Composer from './Composer.svelte';
	import FeedItem from './FeedItem.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/** Home feed: composer, newest first, infinite scroll, pull to refresh. */
	let { initial, next: initialNext, defaultVisibility = 'public' }: { initial: Item[]; next: string | null; defaultVisibility?: 'public' | 'followers' | 'friends' | 'private' } = $props();
	// svelte-ignore state_referenced_locally
	let items = $state<Item[]>(initial);
	// svelte-ignore state_referenced_locally
	let next = $state(initialNext);
	$effect.pre(() => {
		items = initial;
		next = initialNext;
	});
	let loading = $state(false);
	let sentinel: HTMLDivElement;
	let pull = $state(0);
	let refreshing = $state(false);

	async function more() {
		if (!next || loading) return;
		loading = true;
		const r = await fetch(`/api/v1/feed?cursor=${encodeURIComponent(next)}`).catch(() => null);
		if (r?.ok) {
			const page = (await r.json()) as { items: Item[]; next: string | null };
			const keys = new Set(items.map((i) => i.key));
			items = [...items, ...page.items.filter((i) => !keys.has(i.key))];
			next = page.next;
		}
		loading = false;
	}

	async function refresh() {
		refreshing = true;
		await invalidateAll();
		refreshing = false;
	}

	onMount(() => {
		const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void more(), { rootMargin: '600px' });
		io.observe(sentinel);
		// Pull to refresh (touch, at the top of the page).
		let startY: number | null = null;
		const down = (e: TouchEvent) => (startY = window.scrollY <= 0 ? (e.touches[0]?.clientY ?? null) : null);
		const moveT = (e: TouchEvent) => {
			if (startY === null) return;
			pull = Math.max(0, Math.min(90, (e.touches[0]!.clientY - startY) / 2));
		};
		const up = () => {
			if (pull >= 60) void refresh();
			pull = 0;
			startY = null;
		};
		addEventListener('touchstart', down, { passive: true });
		addEventListener('touchmove', moveT, { passive: true });
		addEventListener('touchend', up);
		return () => {
			io.disconnect();
			removeEventListener('touchstart', down);
			removeEventListener('touchmove', moveT);
			removeEventListener('touchend', up);
		};
	});
</script>

<section class="space-y-3" data-testid="feed">
	{#if pull || refreshing}
		<div class="flex justify-center text-xs text-muted" style="height:{refreshing ? 28 : pull / 2}px" aria-live="polite">{refreshing ? m.common_loading() : pull >= 60 ? m.feed_release() : m.feed_pull()}</div>
	{/if}
	<div class="card p-3">
		<Composer
			visibility={defaultVisibility}
			submitLabel={m.post_publish()}
			onsubmit={async (p) => {
				const r = await fetch('/api/v1/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
				if (r.ok) await invalidateAll();
				return r.ok;
			}}
		/>
	</div>
	{#each items as item (item.key)}
		<FeedItem {item} />
	{:else}
		<div class="card p-5 text-center text-sm text-muted">
			<p class="font-semibold text-ink">{m.home_feed_title()}</p>
			<p class="mt-1">{m.feed_empty()}</p>
			<a href="/people" class="btn btn-secondary mt-3">{m.people_title()}</a>
		</div>
	{/each}
	<div bind:this={sentinel} class="h-1"></div>
	{#if loading}<p class="text-center text-sm text-muted">{m.common_loading()}</p>{/if}
	{#if !next && items.length > 5}<p class="py-4 text-center text-xs text-muted">{m.feed_end()}</p>{/if}
</section>
