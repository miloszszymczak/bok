<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import TabBar from '#lib/components/TabBar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import { connectLive, disconnectLive } from '#lib/client/live.svelte.ts';
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
	onMount(() => {
		if (data.user) connectLive(data.unread);
		return disconnectLive;
	});
	let resend = $state<'idle' | 'sending' | 'sent' | 'failed'>('idle');
	async function resendVerification() {
		resend = 'sending';
		const r = await fetch('/api/v1/verify-email', { method: 'POST' }).catch(() => null);
		resend = r?.ok ? 'sent' : 'failed';
	}
	const showTabs = $derived(!!data.profile && !page.url.pathname.startsWith('/auth'));
</script>

<svelte:head>
	<title>bok</title>
</svelte:head>

{#if data.profile?.deletionRequestedAt}
	<div class="bg-danger px-4 py-2 text-center text-sm text-white">
		{m.deletion_banner()} <a href="/settings#danger" class="font-semibold underline">{m.deletion_banner_cta()}</a>
	</div>
{:else if data.user && !data.user.emailVerified && !page.url.pathname.startsWith('/auth')}
	<div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-accent-soft px-4 py-2 text-center text-sm" data-testid="verify-banner">
		<span class="flex items-center gap-2"><Icon name="mail" size={16} />{m.verify_banner()}</span>
		{#if resend === 'sent'}
			<span class="font-bold text-accent" role="status">{m.verify_sent()}</span>
		{:else if resend === 'failed'}
			<span class="font-bold text-danger" role="status">{m.verify_resend_failed()}</span>
		{:else}
			<button type="button" class="font-bold text-accent underline underline-offset-2 disabled:opacity-60" onclick={resendVerification} disabled={resend === 'sending'} data-testid="verify-resend">{m.verify_resend()}</button>
		{/if}
	</div>
{/if}

{@render children()}

{#if showTabs && data.profile}
	<TabBar handle={data.profile.handle} />
{/if}
