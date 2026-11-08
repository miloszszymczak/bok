<script lang="ts">
	import MovableBookList from '#lib/components/MovableBookList.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{m.shelves_unsorted()} · bok</title></svelte:head>

<TopBar title={m.shelves_unsorted()} back="/library?view=shelves" />
<main class="page">
	<p class="mb-4 px-1 text-sm text-muted">{m.shelves_unsorted_explain()}</p>
	<MovableBookList books={data.books} tree={data.tree} current={null} />
	{#if !data.books.length}<p class="card p-6 text-center text-sm text-muted">{m.shelves_unsorted_empty()}</p>{/if}
</main>
