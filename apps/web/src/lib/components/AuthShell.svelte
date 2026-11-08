<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, subtitle = '', children, footer }: { title: string; subtitle?: string; children: Snippet; footer?: Snippet } = $props();
</script>

<main class="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10">
	<a href="/" class="font-serif text-3xl font-bold">bok</a>
	<h1 class="mt-10 font-serif text-3xl font-semibold">{title}</h1>
	{#if subtitle}<p class="mt-2 text-muted">{subtitle}</p>{/if}
	<div class="mt-8 flex-1">{@render children()}</div>
	{#if footer}<div class="mt-8 text-center text-sm text-muted">{@render footer()}</div>{/if}
</main>
