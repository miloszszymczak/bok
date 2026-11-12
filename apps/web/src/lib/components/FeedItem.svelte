<script lang="ts">
	import type { FeedItem } from '@bok/server';
	import BookCover from './BookCover.svelte';
	import Icon from './Icon.svelte';
	import PostCard from './PostCard.svelte';
	import RatingStars from './RatingStars.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { ago } from '#lib/utils/time.ts';

	let { item }: { item: FeedItem } = $props();
	let showReview = $state(false);
</script>

{#if item.kind === 'post'}
	<PostCard post={item.post} />
{:else if item.kind === 'read'}
	<article class="card p-4" data-feed="read">
		<p class="text-sm"><a href="/u/{item.actor.handle}" class="font-semibold">{item.actor.displayName}</a> <span class="text-muted">{m.feed_finished()} · {ago(item.at)}</span></p>
		<a href="/read/{item.id}" class="mt-3 flex gap-3">
			<BookCover src={item.book.cover} title={item.book.title} author={item.book.authors[0]} width={56} />
			<span class="min-w-0 flex-1">
				<span class="block font-serif text-lg leading-snug font-semibold">{item.book.title}</span>
				<span class="block truncate text-sm text-muted">{item.book.authors.join(', ')}</span>
				<span class="mt-1 block"><RatingStars value={item.rating} size={16} /></span>
			</span>
		</a>
		{#if item.review}
			{#if item.reviewSpoiler && !showReview}
				<button class="mt-3 w-full rounded-xl bg-bg p-3 text-sm text-muted" onclick={() => (showReview = true)} data-testid="review-spoiler"><Icon name="alert" size={16} class="mr-1 inline align-[-3px]" />{m.spoiler_show()}</button>
			{:else}
				<p class="mt-3 line-clamp-6 text-sm leading-relaxed whitespace-pre-line">{item.review}</p>
			{/if}
		{/if}
	</article>
{:else}
	<a href="/l/{item.slug}" class="card block p-4" data-feed="list">
		<p class="text-sm"><span class="font-semibold">{item.actor.displayName}</span> <span class="text-muted">{m.feed_new_list()} · {ago(item.at)}</span></p>
		<div class="mt-3 flex items-center gap-3">
			<div class="flex -space-x-4">{#each item.covers as c, i (i)}<BookCover src={c} title={item.title} width={44} />{/each}</div>
			<span class="font-serif text-lg font-semibold">{item.title}</span>
		</div>
	</a>
{/if}
