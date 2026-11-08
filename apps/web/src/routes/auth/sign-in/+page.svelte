<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let mode = $state<'password' | 'magic'>('password');
	let busy = $state(false);
	$effect(() => {
		if (form?.mode === 'magic') mode = 'magic';
	});
	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
	const q = $derived(data.next !== '/' ? `?next=${encodeURIComponent(data.next)}` : '');
</script>

<svelte:head><title>{m.auth_sign_in()} · bok</title></svelte:head>

<AuthShell title={m.auth_welcome_back()}>
	{#if mode === 'password'}
		<form method="POST" action="?/password{q ? '&' + q.slice(1) : ''}" use:enhance={submit} class="space-y-4">
			<div>
				<label class="label" for="email">{m.auth_email()}</label>
				<input class="input" id="email" name="email" type="email" autocomplete="email" required defaultValue={form?.email ?? ''} />
			</div>
			<div>
				<div class="flex items-baseline justify-between">
					<label class="label" for="password">{m.auth_password()}</label>
					<a href="/auth/forgot" class="text-sm text-accent">{m.auth_forgot()}</a>
				</div>
				<input class="input" id="password" name="password" type="password" autocomplete="current-password" required />
			</div>
			{#if form?.error && form.mode === 'password'}<p class="field-error" role="alert">{form.error}</p>{/if}
			<button class="btn btn-primary w-full" disabled={busy}>{m.auth_sign_in()}</button>
		</form>
	{:else}
		<form method="POST" action="?/magic{q ? '&' + q.slice(1) : ''}" use:enhance={submit} class="space-y-4">
			<div>
				<label class="label" for="memail">{m.auth_email()}</label>
				<input class="input" id="memail" name="email" type="email" autocomplete="email" required defaultValue={form?.email ?? ''} />
			</div>
			{#if form?.error && form.mode === 'magic'}<p class="field-error" role="alert">{form.error}</p>{/if}
			<button class="btn btn-primary w-full" disabled={busy}><Icon name="mail" size={18} />{m.auth_send_link()}</button>
		</form>
	{/if}

	<div class="my-6 flex items-center gap-3 text-xs text-muted"><span class="h-px flex-1 bg-line"></span>{m.auth_or()}<span class="h-px flex-1 bg-line"></span></div>

	<div class="grid gap-3">
		<button type="button" class="btn btn-secondary w-full" onclick={() => (mode = mode === 'password' ? 'magic' : 'password')}>
			{mode === 'password' ? m.auth_use_magic() : m.auth_use_password()}
		</button>
		{#if data.google}
			<form method="POST" action="?/google{q ? '&' + q.slice(1) : ''}">
				<button class="btn btn-secondary w-full">{m.auth_google()}</button>
			</form>
		{/if}
	</div>

	{#snippet footer()}
		{m.auth_no_account()} <a href="/auth/sign-up{q}" class="font-semibold text-accent">{m.auth_sign_up()}</a>
	{/snippet}
</AuthShell>
