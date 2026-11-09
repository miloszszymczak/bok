<script lang="ts">
	import type { PostNode } from '@bok/core';
	import { m } from '#lib/paraglide/messages.js';

	/** Renders the parsed post tree (no HTML strings → no XSS). Spoilers blur until tapped. */
	let { nodes, books = {}, compact = false }: { nodes: PostNode[]; books?: Record<string, { title: string; cover: string | null }>; compact?: boolean } = $props();
	let revealed = $state(new Set<string>());
</script>

{#snippet render(list: PostNode[], path: string)}
	{#each list as n, i (i)}
		{#if n.t === 'text'}{n.v}{:else if n.t === 'br'}<br />{:else if n.t === 'b'}<strong>{@render render(n.c, `${path}.${i}`)}</strong>{:else if n.t === 'i'}<em>{@render render(n.c, `${path}.${i}`)}</em>{:else if n.t === 'link'}<a
				href={n.href}
				target="_blank"
				rel="noopener nofollow ugc"
				class="text-accent underline">{@render render(n.c, `${path}.${i}`)}</a
			>{:else if n.t === 'mention'}<a href="/u/{n.handle}" class="font-semibold text-accent">@{n.handle}</a>{:else if n.t === 'tag'}<a href="/t/{n.slug}" class="text-accent">#{n.tag}</a>{:else if n.t === 'book'}{@const b = books[n.workId]}<a
				href="/book/{n.workId}{n.editionId ? `?e=${n.editionId}` : ''}"
				class="mx-0.5 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-accent-soft py-0.5 pr-2 pl-0.5 align-middle text-[0.95em] font-semibold text-accent"
				data-book-chip={n.workId}
				>{#if b?.cover && !compact}<img src={b.cover} alt="" class="h-6 w-4 rounded-sm object-cover" loading="lazy" />{:else}<span aria-hidden="true">📖</span>{/if}<span class="truncate">{b?.title ?? n.title}</span></a
			>{:else if n.t === 'spoiler'}{@const id = `${path}.${i}`}<button
				type="button"
				class="rounded px-0.5 transition {revealed.has(id) ? 'bg-line/60' : 'bg-ink/80 text-transparent blur-[3px] select-none'}"
				aria-label={revealed.has(id) ? undefined : m.spoiler_inline()}
				onclick={(e) => {
					e.preventDefault();
					revealed = new Set([...revealed, id]);
				}}
				data-spoiler>{@render render(n.c, `${path}.${i}`)}</button
			>{/if}
	{/each}
{/snippet}

<div class="leading-relaxed break-words whitespace-pre-wrap">{@render render(nodes, 'r')}</div>
