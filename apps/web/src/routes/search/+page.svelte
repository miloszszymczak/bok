<script lang="ts">
	import BookRow from '#lib/components/BookRow.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{m.nav_search()} · bok</title></svelte:head>

<TopBar title={m.nav_search()} back="/" />
<main class="page">
	<form method="GET" class="relative" role="search">
		<Icon name="search" class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" size={20} />
		<!-- svelte-ignore a11y_autofocus -->
		<input class="input pl-12" type="search" name="q" defaultValue={data.q} placeholder={m.search_placeholder()} autofocus={!data.q} enterkeyhint="search" autocomplete="off" />
	</form>
	<p class="mt-2 px-1 text-xs text-muted">{m.search_hint()}</p>

	{#if data.q}
		<section class="mt-6">
			<h2 class="section-title">{m.search_in_bok()}</h2>
			{#if data.local.length}
				<div class="card divide-y divide-line/60 p-1">
					{#each data.local as b (b.id)}
						<BookRow
							href="/book/{b.id}"
							title={b.title}
							authors={b.authors}
							meta={b.owned ? `📍 ${b.where || m.shelves_unsorted()}` : b.year ? String(b.year) : ''}
							cover={b.cover}
							srcset={b.srcset ?? undefined}
						/>
					{/each}
				</div>
			{:else}
				<p class="px-1 text-sm text-muted">{m.search_no_local()}</p>
			{/if}
		</section>

		<section class="mt-6">
			<h2 class="section-title">{m.search_more_from()}</h2>
			{#await data.remote}
				<p class="px-1 text-sm text-muted">{m.common_loading()}</p>
			{:then remote}
				{#if remote.length}
					<div class="card divide-y divide-line/60 p-1">
						{#each remote as b (b.isbn13)}
							<BookRow href="/isbn/{b.isbn13}" title={b.title} authors={b.authors} meta={[b.year, b.isbn13].filter(Boolean).join(' · ')} cover={b.coverUrl} />
						{/each}
					</div>
				{:else}
					<p class="px-1 text-sm text-muted">{m.search_no_remote()}</p>
				{/if}
			{/await}
		</section>
		<a href="/add?title={encodeURIComponent(data.q)}" class="card mt-6 flex items-center gap-3 p-4 text-sm">
			<Icon name="pencil" class="text-accent" />
			<span class="flex-1"><span class="font-semibold">{m.search_add_manual()}</span><br /><span class="text-muted">{m.search_add_manual_hint()}</span></span>
			<Icon name="forward" size={18} />
		</a>
	{/if}
</main>
