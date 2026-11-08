<script lang="ts">
	import AuthShell from '#lib/components/AuthShell.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>{m.auth_reset_title()} · bok</title></svelte:head>

<AuthShell title={m.auth_reset_title()}>
	{#if data.invalid || !data.token}
		<p class="text-danger">{m.auth_err_token()}</p>
		<a href="/auth/forgot" class="btn btn-secondary mt-6 w-full">{m.auth_send_reset()}</a>
	{:else}
		<form method="POST" class="space-y-4">
			<input type="hidden" name="token" value={data.token} />
			<div>
				<label class="label" for="password">{m.auth_new_password()}</label>
				<input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="10" required />
				<p class="mt-1.5 text-xs text-muted">{m.auth_password_hint()}</p>
			</div>
			{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
			<button class="btn btn-primary w-full">{m.auth_reset_cta()}</button>
		</form>
	{/if}
</AuthShell>
