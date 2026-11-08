<script lang="ts">
	import BookCover from '#lib/components/BookCover.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import InstallPrompt from '#lib/components/InstallPrompt.svelte';
	import { progressText, statusLabel } from '#lib/utils/reading.ts';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

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
	<header class="mx-auto flex max-w-2xl items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
		<p class="font-serif text-3xl font-bold">bok</p>
		<a href="/search" class="grid size-11 place-items-center rounded-full border border-line bg-surface" aria-label={m.nav_search()}><Icon name="search" /></a>
	</header>
	<main class="page space-y-6">
		<h1 class="font-serif text-2xl font-semibold">{m.home_greeting({ name: data.profile.displayName })}</h1>
		<InstallPrompt />

		<section class="grid grid-cols-2 gap-3">
			<a href="/scan" class="card flex flex-col gap-2 p-4 active:scale-[0.99]">
				<Icon name="scan" class="text-accent" size={28} />
				<span class="font-semibold">{m.home_action_scan()}</span>
				<span class="text-sm text-muted">{m.home_action_scan_hint()}</span>
			</a>
			<a href="/search" class="card flex flex-col gap-2 p-4 active:scale-[0.99]">
				<Icon name="search" class="text-accent" size={28} />
				<span class="font-semibold">{m.home_action_search()}</span>
				<span class="text-sm text-muted">{m.home_action_search_hint()}</span>
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
								{#if pct !== null}<div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"><div class="h-full rounded-full bg-accent" style="width:{pct}%"></div></div>{/if}
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if data.goal}
			<a href="/log" class="card block p-4">
				<div class="flex items-baseline justify-between"><p class="font-semibold">{m.goal_title({ year: data.goal.year })}</p><p class="text-sm text-muted">{data.goal.done} / {data.goal.target}</p></div>
				<div class="mt-2 h-2 overflow-hidden rounded-full bg-line"><div class="h-full rounded-full bg-accent" style="width:{Math.min(100, (data.goal.done / data.goal.target) * 100)}%"></div></div>
			</a>
		{/if}

		<section>
			<div class="mb-2 flex items-baseline justify-between px-1">
				<h2 class="section-title mb-0">{m.home_recent()}</h2>
				{#if data.total}<a href="/library" class="text-sm font-medium text-accent">{m.home_library_count({ count: data.total })}</a>{/if}
			</div>
			{#if data.recent.length}
				<div class="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
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

		<section class="card p-4 text-sm text-muted">
			<p class="font-semibold text-ink">{m.home_feed_title()}</p>
			<p class="mt-1">{m.home_feed_soon()}</p>
		</section>
	</main>
{/if}
