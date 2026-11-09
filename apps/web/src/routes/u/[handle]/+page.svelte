<script lang="ts">
	import { enhance } from '$app/forms';
	import { groupLog } from '@bok/core';
	import BookCover from '#lib/components/BookCover.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import ListCard from '#lib/components/ListCard.svelte';
	import OgMeta from '#lib/components/OgMeta.svelte';
	import PostCard from '#lib/components/PostCard.svelte';
	import RatingStars from '#lib/components/RatingStars.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import LendableList from '#lib/components/LendableList.svelte';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { monthName } from '#lib/utils/reading.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const p = $derived(data.person);
	const rel = $derived(data.rel);
	const joined = $derived(new Date(p.joined).toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' }));
	const groups = $derived(groupLog(data.log));
	let menu = $state(false);
	let reporting = $state(false);
	let confirmBlock = $state(false);
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
	const tabs = $derived([
		['log', m.profile_tab_log()],
		['library', m.profile_tab_library()],
		['stats', m.profile_tab_stats()],
		['readlists', m.nav_lists()],
		['posts', m.profile_tab_posts()],
		['lending', m.profile_tab_lending()]
	] as const);
</script>

<svelte:head>
	<title>{p.displayName} (@{p.handle}) · bok</title>
</svelte:head>
<OgMeta title="{p.displayName} (@{p.handle})" description={p.bio || m.og_profile_desc({ name: p.displayName })} image={data.og.image} url={data.og.url} type="profile" />

<TopBar title="@{p.handle}">
	{#snippet actions()}
		{#if p.isMe}
			<a href="/settings" class="grid size-10 place-items-center rounded-full hover:bg-line/50" aria-label={m.nav_settings()}><Icon name="settings" /></a>
		{:else if data.profile}
			<div class="relative">
				<button class="grid size-10 place-items-center rounded-full text-xl hover:bg-line/50" onclick={() => (menu = !menu)} aria-label={m.social_more()} aria-expanded={menu} data-testid="profile-menu">⋯</button>
				{#if menu}
					<button class="fixed inset-0 z-40 cursor-default" aria-label={m.common_close()} onclick={() => (menu = false)}></button>
					<div class="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-lg" role="menu">
						{#if rel.blocked === 'by_me'}
							<form method="POST" action="?/unblock" use:enhance={keep}><button role="menuitem" class="w-full px-4 py-3 text-left text-sm" onclick={() => (menu = false)}>{m.social_unblock()}</button></form>
						{:else}
							<button role="menuitem" class="w-full px-4 py-3 text-left text-sm text-danger" onclick={() => ((menu = false), (confirmBlock = true))}>{m.social_block()}</button>
						{/if}
						<button role="menuitem" class="w-full border-t border-line px-4 py-3 text-left text-sm" onclick={() => ((menu = false), (reporting = true))}>{m.social_report()}</button>
					</div>
				{/if}
			</div>
		{/if}
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
			<p class="text-muted">@{p.handle}
				{#if rel.friend === 'friends'}<span class="ml-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{m.social_friend()}</span>
				{:else if rel.followedBy}<span class="ml-1 rounded-full bg-line px-2 py-0.5 text-xs">{m.social_follows_you()}</span>{/if}
			</p>
			<p class="mt-1 text-xs text-muted">{m.profile_joined({ date: joined })}</p>
		</div>
	</section>
	{#if p.bio && rel.blocked !== 'by_me'}<p class="mt-4 leading-relaxed whitespace-pre-line">{p.bio}</p>{/if}

	<section class="mt-5 grid grid-cols-4 gap-2 text-center">
		<div class="card p-2.5"><p class="font-serif text-xl font-bold">{data.stats?.total ?? '–'}</p><p class="text-[11px] text-muted">{m.profile_read()}</p></div>
		<a href="/u/{p.handle}/followers" class="card p-2.5"><p class="font-serif text-xl font-bold" data-testid="followers-count">{data.counts.followers}</p><p class="text-[11px] text-muted">{m.profile_followers()}</p></a>
		<a href="/u/{p.handle}/following" class="card p-2.5"><p class="font-serif text-xl font-bold">{data.counts.following}</p><p class="text-[11px] text-muted">{m.profile_following()}</p></a>
		<a href="/u/{p.handle}/friends" class="card p-2.5"><p class="font-serif text-xl font-bold" data-testid="friends-count">{data.counts.friends}</p><p class="text-[11px] text-muted">{m.profile_friends()}</p></a>
	</section>

	{#if p.isMe}
		<div class="mt-5 grid grid-cols-3 gap-2">
			<a href="/log" class="btn btn-primary h-11 px-2 text-sm" data-testid="open-log">{m.log_title()}</a>
			<a href="/people" class="btn btn-secondary h-11 px-2 text-sm">{m.people_title()}</a>
			<a href="/settings" class="btn btn-secondary h-11 px-2 text-sm">{m.profile_edit()}</a>
		</div>
	{:else if !data.profile}
		<a href="/auth/sign-in?next=/u/{p.handle}" class="btn btn-primary mt-5 w-full">{m.social_sign_in_to_follow()}</a>
	{:else if rel.blocked === 'by_me'}
		<p class="card mt-5 p-4 text-sm text-muted">{m.social_you_blocked()}</p>
	{:else}
		<div class="mt-5 grid grid-cols-2 gap-2" data-testid="social-actions">
			<form method="POST" action={rel.following ? '?/unfollow' : '?/follow'} use:enhance={keep}>
				<button class="btn w-full {rel.following ? 'btn-secondary' : 'btn-primary'}" data-testid="follow">{rel.following ? m.social_following() : m.social_follow()}</button>
			</form>
			{#if rel.friend === 'incoming'}
				<div class="flex gap-1">
					<form method="POST" action="?/accept" use:enhance={keep} class="flex-1"><button class="btn btn-primary w-full px-2" data-testid="accept">{m.social_accept()}</button></form>
					<form method="POST" action="?/unfriend" use:enhance={keep}><button class="btn btn-secondary px-3" aria-label={m.social_decline()}>✕</button></form>
				</div>
			{:else}
				<form method="POST" action={rel.friend === 'none' ? '?/friend' : '?/unfriend'} use:enhance={keep}>
					<button class="btn btn-secondary w-full" data-testid="friend">
						{rel.friend === 'friends' ? `✓ ${m.social_friends()}` : rel.friend === 'requested' ? m.social_requested() : m.social_add_friend()}
					</button>
				</form>
			{/if}
		</div>
	{/if}

	{#if form?.reported}<p class="mt-3 rounded-xl bg-accent-soft px-4 py-2 text-sm" role="status">{m.social_reported()}</p>{/if}

	{#if rel.blocked !== 'by_me'}
		<nav class="-mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-line px-4 text-sm font-semibold" aria-label={m.profile_tabs()}>
			{#each tabs as [id, label] (id)}
				<a href="?tab={id}" data-sveltekit-replacestate data-sveltekit-noscroll class="shrink-0 border-b-2 px-3 py-2.5 {data.tab === id ? 'border-accent text-ink' : 'border-transparent text-muted'}" aria-current={data.tab === id ? 'page' : undefined}>{label}</a>
			{/each}
		</nav>

		<section class="mt-4">
			{#if data.tab === 'log'}
				{#each groups as grp (grp.year ?? 'past')}
					<h2 class="mt-2 mb-2 px-1 font-serif text-xl font-bold">{grp.year ?? m.log_past()}</h2>
					{#each grp.months as mo (mo.month ?? 'none')}
						{#if grp.year !== null}<h3 class="section-title mt-2">{mo.month ? monthName(mo.month) : m.log_sometime({ year: grp.year })}</h3>{/if}
						<ul class="card divide-y divide-line/60">
							{#each mo.entries as e (e.id)}
								<li>
									<a href="/read/{e.id}" class="flex items-center gap-3 p-2.5" data-entry={e.title}>
										<BookCover src={e.cover} title={e.title} width={36} />
										<span class="min-w-0 flex-1"><span class="block truncate font-medium">{e.readNumber > 1 ? '↻ ' : ''}{e.title}</span><span class="block truncate text-xs text-muted">{e.authors.join(', ')}</span></span>
										<RatingStars value={e.rating} />
									</a>
								</li>
							{/each}
						</ul>
					{/each}
				{:else}
					<p class="card p-6 text-center text-sm text-muted">{m.profile_log_empty()}</p>
				{/each}
			{:else if data.tab === 'library'}
				{#if data.library === null}
					<p class="card p-6 text-center text-sm text-muted" data-testid="library-hidden">{m.profile_library_hidden()}</p>
				{:else if data.library.length}
					<div class="grid grid-cols-3 gap-3 sm:grid-cols-4" data-testid="public-library">
						{#each data.library as b (b.workId)}
							<a href="/book/{b.workId}?e={b.editionId}" class="min-w-0">
								<BookCover src={b.cover} title={b.title} author={b.authors[0]} width={104} />
								<p class="mt-1 line-clamp-2 text-xs font-medium">{b.title}</p>
							</a>
						{/each}
					</div>
				{:else}
					<p class="card p-6 text-center text-sm text-muted">{m.profile_library_empty()}</p>
				{/if}
			{:else if data.tab === 'stats'}
				<div class="grid grid-cols-2 gap-3">
					<div class="card p-4"><p class="text-xs text-muted">{m.stats_this_year({ year: data.year })}</p><p class="font-serif text-3xl font-bold">{data.stats?.thisYear ?? 0}</p></div>
					<div class="card p-4"><p class="text-xs text-muted">{m.stats_pages({ year: data.year })}</p><p class="font-serif text-3xl font-bold">{data.stats?.pagesThisYear ?? 0}</p></div>
					<div class="card p-4"><p class="text-xs text-muted">{m.stats_total()}</p><p class="font-serif text-3xl font-bold">{data.stats?.total ?? 0}</p></div>
					<div class="card p-4"><p class="text-xs text-muted">{m.stats_avg_rating()}</p><p class="font-serif text-3xl font-bold">{data.stats?.avgStars ?? '–'}{#if data.stats?.avgStars}<span class="text-lg">★</span>{/if}</p></div>
				</div>
				<p class="mt-3 px-1 text-xs text-muted">{m.stats_visible_note()}</p>
				<div class="mt-3 grid grid-cols-2 gap-3">
					<a href="/u/{p.handle}/stats" class="btn btn-secondary" data-testid="all-stats">{m.stats_all()}</a>
					<a href="/u/{p.handle}/year/{data.year}" class="btn btn-secondary" data-testid="year-review">{m.year_open({ year: data.year })}</a>
				</div>
			{:else if data.tab === 'readlists'}
				<div class="space-y-3" data-testid="profile-lists">
					{#each data.lists as l (l.id)}<ListCard list={l} href={p.isMe ? `/lists/${l.id}` : `/l/${l.slug}`} showVisibility={p.isMe} />{:else}<p class="card p-6 text-center text-sm text-muted">{m.profile_lists_empty()}</p>{/each}
				</div>
			{:else if data.tab === 'lending'}
				{#if p.isMe}
					<a href="/loans" class="card flex items-center justify-between p-4 font-medium" data-testid="my-loans-link">{m.loans_title()}<Icon name="forward" size={16} class="text-muted" /></a>
					<p class="mt-2 px-1 text-xs text-muted">{m.profile_lending_me_hint()}</p>
				{:else if !data.profile}
					<p class="card p-6 text-center text-sm text-muted">{m.profile_lending_sign_in()}</p>
				{:else}
					{#if data.lending.length}<LendableList items={data.lending} />{:else}<p class="card p-6 text-center text-sm text-muted" data-testid="lending-empty">{m.profile_lending_empty()}</p>{/if}
					<a href="/loans?with={p.handle}" class="mt-3 block text-center text-sm font-medium text-accent">{m.loans_between({ name: p.displayName })}</a>
				{/if}
			{:else}
				<div class="space-y-3" data-testid="profile-posts">
					{#each data.posts as post (post.id)}<PostCard {post} signedIn={!!data.profile} />{:else}<p class="card p-6 text-center text-sm text-muted">{m.profile_posts_empty()}</p>{/each}
					{#if data.postsNext}<a href="?tab=posts&cursor={data.postsNext}" class="btn btn-secondary w-full">{m.common_more()}</a>{/if}
				</div>
			{/if}
		</section>
	{/if}
</main>

{#if confirmBlock}
	<div class="fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center" role="dialog" aria-modal="true" aria-label={m.social_block()}>
		<form method="POST" action="?/block" use:enhance={() => async ({ update }) => { await update({ reset: false }); confirmBlock = false; }} class="w-full max-w-md space-y-3 rounded-t-2xl bg-bg p-5 sm:rounded-2xl">
			<h2 class="font-serif text-lg font-bold">{m.social_block_title({ name: p.displayName })}</h2>
			<p class="text-sm text-muted">{m.social_block_explain()}</p>
			<div class="flex gap-2"><button class="btn btn-danger flex-1" data-testid="confirm-block">{m.social_block()}</button><button type="button" class="btn btn-secondary" onclick={() => (confirmBlock = false)}>{m.common_cancel()}</button></div>
		</form>
	</div>
{/if}

{#if reporting}
	<div class="fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center" role="dialog" aria-modal="true" aria-label={m.social_report()}>
		<form method="POST" action="?/report" use:enhance={() => async ({ update }) => { await update({ reset: false }); reporting = false; }} class="w-full max-w-md space-y-3 rounded-t-2xl bg-bg p-5 sm:rounded-2xl">
			<h2 class="font-serif text-lg font-bold">{m.social_report_title({ name: p.displayName })}</h2>
			<fieldset class="space-y-1.5">
				{#each data.reasons as r, i (r)}
					<label class="flex items-center gap-3 text-sm"><input type="radio" name="reason" value={r} checked={i === 0} class="size-4 border-line text-accent focus:ring-accent" />{r === 'spam' ? m.report_spam() : r === 'abuse' ? m.report_abuse() : r === 'inappropriate' ? m.report_inappropriate() : r === 'impersonation' ? m.report_impersonation() : m.report_other()}</label>
				{/each}
			</fieldset>
			<textarea class="input" name="details" rows="3" maxlength="2000" placeholder={m.report_details()}></textarea>
			<div class="flex gap-2"><button class="btn btn-primary flex-1" data-testid="send-report">{m.social_report_send()}</button><button type="button" class="btn btn-secondary" onclick={() => (reporting = false)}>{m.common_cancel()}</button></div>
		</form>
	</div>
{/if}
