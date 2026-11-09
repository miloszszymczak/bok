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

<nav class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label={m.nav_label()}>
	<ul class="mx-auto grid h-16 max-w-2xl grid-cols-5">
		{#each tabs as t (t.href)}
			{@const active = t.match(page.url.pathname)}
			<li>
				<a
					href={t.href}
					class="flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium {active ? 'text-accent' : 'text-muted'}"
					aria-current={active ? 'page' : undefined}
				>
					{#if t.primary}
						<span class="-mt-5 grid size-14 place-items-center rounded-full bg-accent text-accent-ink shadow-lg ring-4 ring-bg"><Icon name={t.icon} size={26} /></span>
					{:else}
						<span class="relative">
							<Icon name={t.icon} stroke={active ? 2.4 : 2} />
							{#if t.icon === 'user' && live.unread}<span class="absolute -top-1 -right-2 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 font-bold text-white" data-testid="unread-badge">{live.unread > 9 ? '9+' : live.unread}</span>{/if}
						</span>
					{/if}
					<span>{t.label}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>
