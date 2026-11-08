<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const p = $derived(data.person);
	const joined = $derived(new Date(p.joined).toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' }));
</script>

<svelte:head>
	<title>{p.displayName} (@{p.handle}) · bok</title>
	<meta property="og:title" content="{p.displayName} on bok" />
</svelte:head>

<TopBar title="@{p.handle}">
	{#snippet actions()}
		{#if p.isMe}<a href="/settings" class="grid size-10 place-items-center rounded-full hover:bg-line/50" aria-label={m.nav_settings()}><Icon name="settings" /></a>{/if}
	{/snippet}
</TopBar>
<main class="page">
	<section class="flex items-center gap-4">
		{#if p.avatarUrl}
			<img src={p.avatarUrl} alt="" class="size-20 rounded-full object-cover ring-1 ring-line" width="80" height="80" />
		{:else}
			<div class="grid size-20 place-items-center rounded-full bg-accent-soft font-serif text-3xl font-bold text-accent">{p.displayName.slice(0, 1).toUpperCase()}</div>
		{/if}
		<div class="min-w-0">
			<h1 class="truncate font-serif text-2xl font-bold">{p.displayName}</h1>
			<p class="text-muted">@{p.handle}</p>
			<p class="mt-1 text-xs text-muted">{m.profile_joined({ date: joined })}</p>
		</div>
	</section>
	{#if p.bio}<p class="mt-4 leading-relaxed whitespace-pre-line">{p.bio}</p>{/if}

	<section class="mt-6 grid grid-cols-3 gap-2 text-center">
		<div class="card p-3"><p class="font-serif text-2xl font-bold">{data.bookCount}</p><p class="text-xs text-muted">{m.profile_books()}</p></div>
		<div class="card p-3 opacity-60"><p class="font-serif text-2xl font-bold">–</p><p class="text-xs text-muted">{m.profile_followers()}</p></div>
		<div class="card p-3 opacity-60"><p class="font-serif text-2xl font-bold">–</p><p class="text-xs text-muted">{m.profile_following()}</p></div>
	</section>

	{#if p.isMe}
		<div class="mt-6 grid grid-cols-2 gap-3">
			<a href="/log" class="btn btn-primary" data-testid="open-log">{m.log_title()}</a>
			<a href="/settings" class="btn btn-secondary">{m.profile_edit()}</a>
		</div>
	{/if}
</main>
