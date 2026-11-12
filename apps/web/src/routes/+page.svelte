<script lang="ts">
	import BookCover from '#lib/components/BookCover.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import InstallPrompt from '#lib/components/InstallPrompt.svelte';
	import { progressText, statusLabel } from '#lib/utils/reading.ts';
	import { live } from '#lib/client/live.svelte.ts';
	import Feed from '#lib/components/Feed.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><meta name="description" content={m.meta_description()} /></svelte:head>

{#if !data.profile}
	<main class="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-10">
		<div>
			<p class="font-serif text-5xl font-bold tracking-tight">bok</p>
			<h1 class="mt-8 font-serif text-3xl leading-tight font-semibold">{m.landing_title()}</h1>
			<p class="mt-4 text-lg text-muted">{m.landing_body()}</p>
			<ul class="mt-8 space-y-3 text-[15px]">
				{#each [m.landing_point_scan(), m.landing_point_shelves(), m.landing_point_log(), m.landing_point_share()] as point (point)}
					<li class="flex gap-3"><Icon name="check" class="mt-0.5 shrink-0 text-accent" size={20} />{point}</li>
				{/each}
			</ul>
		</div>
		<div class="mt-10 grid gap-3">
			<a href="/auth/sign-up" class="btn btn-primary">{m.auth_sign_up()}</a>
			<a href="/auth/sign-in" class="btn btn-secondary">{m.auth_sign_in()}</a>
			<p class="mt-2 text-center text-xs text-muted"><a href="/privacy" class="underline">{m.legal_privacy()}</a> · <a href="/terms" class="underline">{m.legal_terms()}</a></p>
		</div>
	</main>
{:else}
	<header class="mx-auto flex max-w-2xl items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
		<p class="font-serif text-3xl font-bold">bok</p>
		<div class="flex gap-2">
			<a href="/notifications" class="icon-btn" aria-label={m.notifications_title()} data-testid="bell">
				<Icon name="bell" />
				{#if live.unread}<span class="absolute -top-2 -right-2 min-w-5 rounded-full border-2 border-outline bg-apricot px-1 text-center text-[11px] leading-4 font-bold text-accent-ink">{live.unread > 9 ? '9+' : live.unread}</span>{/if}
			</a>
			<a href="/search" class="icon-btn" aria-label={m.nav_search()}><Icon name="search" /></a>
		</div>
	</header>
	<main class="page space-y-6">
		<h1 class="font-serif text-2xl font-semibold">{m.home_greeting({ name: data.profile.displayName })}</h1>
		<InstallPrompt />
		{#if data.reviewYear}
			<a href="/u/{data.profile.handle}/year/{data.reviewYear}" class="flex items-center gap-3 rounded-2xl bg-ink p-4 text-bg" data-testid="year-banner">
				<span class="flex-1"><span class="block font-serif text-lg font-bold">{m.year_banner({ year: data.reviewYear })}</span><span class="text-sm opacity-80">{m.year_banner_sub()}</span></span>
				<Icon name="forward" />
			</a>
		{/if}

		<section class="grid grid-cols-2 gap-3">
			<a href="/scan" class="card card-band flex flex-col gap-2 !bg-accent p-4 text-accent-ink">
				<Icon name="scan" size={28} />
				<span class="font-serif text-lg font-semibold">{m.home_action_scan()}</span>
				<span class="text-sm opacity-85">{m.home_action_scan_hint()}</span>
			</a>
			<a href="/search" class="card card-band flex flex-col gap-2 !bg-apricot p-4 text-accent-ink">
				<Icon name="search" size={28} />
				<span class="font-serif text-lg font-semibold">{m.home_action_search()}</span>
				<span class="text-sm opacity-85">{m.home_action_search_hint()}</span>
			</a>
		</section>

		{#if data.inProgress.length}
			<section data-testid="currently-reading">
				<h2 class="section-title">{m.home_reading()}</h2>
				<div class="space-y-2">
					{#each data.inProgress as r (r.readId)}
						{@const pct = r.total && r.progress !== null ? Math.round((r.progress / r.total) * 100) : null}
						<a href="/book/{r.workId}" class="card flex items-center gap-3 p-2.5">
							<BookCover src={r.cover} title={r.title} width={44} />
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium">{r.title}</p>
								<p class="text-xs {r.status === 'stuck' ? 'text-warn' : 'text-muted'}">{r.status === 'stuck' ? statusLabel('stuck') : progressText(r.progress, r.total, r.format) || m.status_reading()}</p>
								{#if pct !== null}<div class="meter mt-1.5 h-2.5"><div class="meter-fill" style="width:{pct}%"></div></div>{/if}
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if data.goal}
			<a href="/log" class="card block p-4">
				<div class="flex items-baseline justify-between"><p class="font-semibold">{m.goal_title({ year: data.goal.year })}</p><p class="text-sm text-muted">{data.goal.done} / {data.goal.target}</p></div>
				<div class="meter mt-2"><div class="meter-fill" style="width:{Math.min(100, (data.goal.done / data.goal.target) * 100)}%"></div></div>
			</a>
		{/if}

		<section>
			<div class="mb-2 flex items-baseline justify-between px-1">
				<h2 class="section-title mb-0">{m.home_recent()}</h2>
				{#if data.total}<a href="/library" class="text-sm font-medium text-accent">{m.home_library_count({ count: data.total })}</a>{/if}
			</div>
			{#if data.recent.length}
				<div class="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pt-0.5 pb-2">
					{#each data.recent as b, i (b.workId + i)}
						<a href="/book/{b.workId}" class="w-24 shrink-0 snap-start">
							<BookCover src={b.cover} srcset={b.srcset ?? undefined} title={b.title} author={b.authors[0]} width={96} eager={i < 4} />
							<p class="mt-1.5 line-clamp-2 text-xs font-medium">{b.title}</p>
						</a>
					{/each}
				</div>
			{:else}
				<div class="card p-6 text-center text-muted">
					<p>{m.home_empty()}</p>
					<a href="/scan" class="btn btn-primary mt-4"><Icon name="scan" />{m.home_action_scan()}</a>
				</div>
			{/if}
		</section>

		<div>
			<h2 class="section-title">{m.home_feed_title()}</h2>
			<Feed initial={data.feed.items} next={data.feed.next} defaultVisibility={data.defaultVisibility} />
		</div>
	</main>
{/if}
