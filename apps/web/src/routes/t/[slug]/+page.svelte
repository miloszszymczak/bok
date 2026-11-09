<script lang="ts">
	import { page } from '$app/state';
	import PostCard from '#lib/components/PostCard.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>#{data.tag.name} · bok</title></svelte:head>

<TopBar title="#{data.tag.name}" back="/" />
<main class="page space-y-5">
	{#if data.books.length}
		<section>
			<h2 class="section-title">{m.tag_books()}</h2>
			<div class="flex flex-wrap gap-2">
				{#each data.books as b (b.workId)}<a href="/book/{b.workId}" class="rounded-full border border-line px-3 py-1 text-sm">{b.title} <span class="text-muted">{b.n}</span></a>{/each}
			</div>
		</section>
	{/if}
	<section class="space-y-3" data-testid="tag-posts">
		<h2 class="section-title">{m.tag_posts()}</h2>
		{#each data.posts as p (p.id)}<PostCard post={p} signedIn={!!page.data.profile} />{:else}<p class="card p-6 text-center text-sm text-muted">{m.tag_no_posts()}</p>{/each}
		{#if data.next}<a href="?cursor={data.next}" class="btn btn-secondary w-full">{m.common_more()}</a>{/if}
	</section>
</main>
