<script lang="ts">
	import { booksText } from '#lib/utils/reading.ts';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import BookCover from '#lib/components/BookCover.svelte';
	import OgMeta from '#lib/components/OgMeta.svelte';
	import ShareButton from '#lib/components/ShareButton.svelte';
	import ReportDialog from '#lib/components/ReportDialog.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const l = $derived(data.list);
	const signedIn = $derived(!!page.data.profile);
	let reporting = $state(false);
</script>

<svelte:head><title>{l.title} — {l.ownerName} · bok</title></svelte:head>
<OgMeta
	title={l.title}
	description={l.description || m.public_list_og({ name: l.ownerName, count: booksText(l.count) })}
	image={data.og.image}
	url={data.og.url}
	noindex={l.visibility !== 'public'}
/>

<header class="mx-auto flex max-w-2xl items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
	<a href="/" class="font-serif text-2xl font-bold">bok</a>
	{#if !signedIn}<a href="/auth/sign-in?next=/l/{l.slug}" class="text-sm font-semibold text-accent">{m.auth_sign_in()}</a>{/if}
</header>

<main class="page space-y-5">
	<section>
		<p class="text-sm text-muted">{m.public_list_label()}</p>
		<h1 class="mt-1 font-serif text-3xl leading-tight font-bold" data-testid="list-title">{l.title}</h1>
		<p class="mt-2 text-sm text-muted">
			{#if signedIn}<a href="/u/{l.ownerHandle}" class="font-semibold text-ink">{l.ownerName}</a>{:else}<span class="font-semibold text-ink">{l.ownerName}</span>{/if}
			· {booksText(l.count)}{#if data.saves} · {m.public_list_saves({ count: data.saves })}{/if}
		</p>
		{#if l.description}<p class="mt-3 leading-relaxed whitespace-pre-line">{l.description}</p>{/if}
	</section>

	<div class="flex gap-2">
		{#if data.isOwner}
			<a href="/lists/{l.id}" class="btn btn-secondary flex-1">{m.book_edit()}</a>
		{:else}
			<form method="POST" action="?/save" use:enhance={() => async ({ update }) => update({ reset: false })} class="flex-1">
				<button class="btn w-full {data.saved ? 'btn-secondary' : 'btn-primary'}" data-testid="save-list">{data.saved ? `✓ ${m.public_list_saved()}` : m.public_list_save()}</button>
			</form>
		{/if}
		<ShareButton url={data.og.url} title={l.title} />
	</div>

	<ol class="space-y-3" data-testid="public-items">
		{#each data.items as it, i (it.id)}
			<li class="card flex gap-3 p-3">
				<span class="w-6 shrink-0 pt-1 text-right font-serif text-lg font-bold text-muted">{i + 1}</span>
				<a href="/book/{it.workId}" class="shrink-0" tabindex="-1" aria-hidden="true"><BookCover src={it.cover} title={it.title} author={it.authors[0]} width={64} eager={i < 3} /></a>
				<div class="min-w-0 flex-1">
					<a href="/book/{it.workId}" class="font-serif text-lg leading-snug font-semibold">{it.title}</a>
					<p class="text-sm text-muted">{[it.authors.join(', '), it.year].filter(Boolean).join(' · ')}</p>
					{#if it.note}<p class="mt-2 border-l-2 border-accent pl-3 text-sm leading-relaxed">{it.note}</p>{/if}
				</div>
			</li>
		{:else}
			<li class="card p-6 text-center text-sm text-muted">{m.public_list_empty()}</li>
		{/each}
	</ol>

	{#if signedIn && !data.isOwner}
		<button class="w-full text-center text-xs text-muted underline" onclick={() => (reporting = true)}>{m.report_list()}</button>
	{/if}
	{#if reporting}<ReportDialog targetType="readlist" targetId={l.id} name={l.title} onclose={() => (reporting = false)} />{/if}

	{#if !signedIn}
		<section class="card space-y-3 p-5 text-center" data-testid="cta">
			<p class="font-serif text-xl font-bold">{m.public_cta_title()}</p>
			<p class="text-sm text-muted">{m.public_cta_body()}</p>
			<a href="/auth/sign-up?next=/l/{l.slug}" class="btn btn-primary w-full">{m.public_cta_button()}</a>
		</section>
	{/if}
</main>
