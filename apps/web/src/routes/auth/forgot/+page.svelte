<script lang="ts">
	import AuthShell from '#lib/components/AuthShell.svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<svelte:head><title>{m.auth_forgot()} · bok</title></svelte:head>

<AuthShell title={m.auth_forgot_title()} subtitle={m.auth_forgot_subtitle()}>
	<form method="POST" class="space-y-4">
		<div>
			<label class="label" for="email">{m.auth_email()}</label>
			<input class="input" id="email" name="email" type="email" autocomplete="email" required />
		</div>
		<button class="btn btn-primary w-full">{m.auth_send_reset()}</button>
	</form>
	{#snippet footer()}<a href="/auth/sign-in" class="font-semibold text-accent">{m.auth_back_to_sign_in()}</a>{/snippet}
</AuthShell>
