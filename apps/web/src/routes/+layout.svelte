<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import TabBar from '#lib/components/TabBar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	// Signed out on this device → drop its offline data (loaded lazily; Dexie stays out of the main bundle).
	$effect(() => {
		if (data.user) return;
		let flagged = false;
		try {
			flagged = localStorage.getItem('bok-has-local') === '1';
		} catch {
			/* ignore */
		}
		if (flagged) void import('#lib/client/db.ts').then((d) => d.wipeLocalData());
	});
	const showTabs = $derived(!!data.profile && !page.url.pathname.startsWith('/auth'));
</script>

<svelte:head>
	<title>bok</title>
	<meta name="description" content={m.meta_description()} />
</svelte:head>

{#if data.profile?.deletionRequestedAt}
	<div class="bg-danger px-4 py-2 text-center text-sm text-white">
		{m.deletion_banner()} <a href="/settings#danger" class="font-semibold underline">{m.deletion_banner_cta()}</a>
	</div>
{:else if data.user && !data.user.emailVerified && !page.url.pathname.startsWith('/auth')}
	<div class="flex items-center justify-center gap-2 bg-accent-soft px-4 py-2 text-center text-sm">
		<Icon name="mail" size={16} />{m.verify_banner()}
	</div>
{/if}

{@render children()}

{#if showTabs && data.profile}
	<TabBar handle={data.profile.handle} />
{/if}
