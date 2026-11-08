<script lang="ts">
	import { page } from '$app/state';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';

	const email = $derived(page.url.searchParams.get('email') ?? '');
	const kind = $derived(page.url.searchParams.get('kind'));
</script>

<svelte:head><title>{m.auth_check_email()} · bok</title></svelte:head>

<AuthShell title={m.auth_check_email()}>
	<div class="card flex gap-3 p-4">
		<Icon name="mail" class="shrink-0 text-accent" />
		<p>{kind === 'reset' ? m.auth_check_reset({ email }) : m.auth_check_magic({ email })}</p>
	</div>
	{#snippet footer()}<a href="/auth/sign-in" class="font-semibold text-accent">{m.auth_back_to_sign_in()}</a>{/snippet}
</AuthShell>
