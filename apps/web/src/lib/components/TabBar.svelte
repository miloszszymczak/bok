<script lang="ts">
	import { page } from '$app/state';
	import Icon, { type IconName } from './Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { live } from '#lib/client/live.svelte.ts';

	let { handle }: { handle: string } = $props();

	const tabs = $derived<{ href: string; label: string; icon: IconName; match: (p: string) => boolean; primary?: boolean }[]>([
		{ href: '/', label: m.nav_home(), icon: 'home', match: (p) => p === '/' },
		{ href: '/library', label: m.nav_library(), icon: 'library', match: (p) => p.startsWith('/library') || p.startsWith('/book') },
		{ href: '/scan', label: m.nav_scan(), icon: 'scan', match: (p) => p.startsWith('/scan'), primary: true },
		{ href: '/lists', label: m.nav_lists(), icon: 'lists', match: (p) => p.startsWith('/lists') },
		{ href: `/u/${handle}`, label: m.nav_profile(), icon: 'user', match: (p) => p.startsWith('/u/') || p.startsWith('/settings') }
	]);
</script>

<nav class="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]" aria-label={m.nav_label()}>
	<ul class="mx-auto grid h-16 max-w-2xl grid-cols-5 rounded-xl border-[2.5px] border-outline bg-surface shadow-[4px_4px_0_var(--outline)]">
		{#each tabs as t (t.href)}
			{@const active = t.match(page.url.pathname)}
			<li>
				<a
					href={t.href}
					class="flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold {active ? 'text-ink' : 'text-muted'}"
					aria-current={active ? 'page' : undefined}
				>
					{#if t.primary}
						<span class="-mt-7 grid size-14 place-items-center rounded-xl border-[2.5px] border-outline bg-accent text-accent-ink shadow-[4px_4px_0_var(--outline),inset_0_-7px_0_var(--shade)]"><Icon name={t.icon} size={26} stroke={2.4} /></span>
					{:else}
						<span class="relative">
							<Icon name={t.icon} stroke={active ? 2.6 : 2.1} />
							{#if t.icon === 'user' && live.unread}<span class="absolute -top-1.5 -right-2.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-outline bg-apricot px-1 text-[10px] leading-none font-bold text-accent-ink" data-testid="unread-badge">{live.unread > 9 ? '9+' : live.unread}</span>{/if}
						</span>
					{/if}
					<span>{t.label}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>
