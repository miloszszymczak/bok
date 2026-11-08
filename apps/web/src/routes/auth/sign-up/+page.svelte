<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	const q = $derived(data.next !== '/' ? `?next=${encodeURIComponent(data.next)}` : '');
</script>

<svelte:head><title>{m.auth_sign_up()} · bok</title></svelte:head>

<AuthShell title={m.auth_create_account()} subtitle={m.auth_create_subtitle()}>
	<form
		method="POST"
		action={q}
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
		class="space-y-4"
	>
		<div>
			<label class="label" for="name">{m.auth_name()}</label>
			<input class="input" id="name" name="name" autocomplete="name" required maxlength="60" defaultValue={form?.name ?? ''} />
		</div>
		<div>
			<label class="label" for="email">{m.auth_email()}</label>
			<input class="input" id="email" name="email" type="email" autocomplete="email" required defaultValue={form?.email ?? ''} />
		</div>
		<div>
			<label class="label" for="password">{m.auth_password()}</label>
			<input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="10" required />
			<p class="mt-1.5 text-xs text-muted">{m.auth_password_hint()}</p>
		</div>
		<label class="flex items-start gap-3 text-sm">
			<input type="checkbox" name="terms" required class="mt-0.5 size-5 rounded border-line text-accent focus:ring-accent" />
			<span>{m.auth_accept_prefix()} <a href="/terms" class="underline">{m.auth_accept_terms_link()}</a> {m.common_and()} <a href="/privacy" class="underline">{m.auth_accept_privacy_link()}</a></span>
		</label>
		{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
		<button class="btn btn-primary w-full" disabled={busy}>{m.auth_sign_up()}</button>
	</form>
	{#if data.google}
		<form method="POST" action="/auth/sign-in?/google" class="mt-3">
			<button class="btn btn-secondary w-full">{m.auth_google()}</button>
		</form>
	{/if}
	{#snippet footer()}
		{m.auth_have_account()} <a href="/auth/sign-in{q}" class="font-semibold text-accent">{m.auth_sign_in()}</a>
	{/snippet}
</AuthShell>
