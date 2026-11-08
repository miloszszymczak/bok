<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
</script>

<svelte:head><title>Offline · bok</title></svelte:head>

<main class="grid min-h-dvh place-items-center px-6 text-center">
	<div>
		<p class="font-serif text-4xl font-bold">bok</p>
		<Icon name="alert" size={32} class="mx-auto mt-8 text-warn" />
		<p class="mt-3 font-semibold">You're offline · Jesteś offline</p>
		<p class="mt-1 text-sm text-muted">This page needs a connection. · Ta strona wymaga połączenia.</p>
		<button class="btn btn-secondary mt-6" onclick={() => location.reload()}>Retry · Spróbuj ponownie</button>
	</div>
</main>
