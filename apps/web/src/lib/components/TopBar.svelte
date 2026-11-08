<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';

	let { title = '', back, actions }: { title?: string; back?: string; actions?: Snippet } = $props();
</script>

<header class="sticky top-0 z-20 border-b border-line/70 bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
	<div class="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4">
		{#if back}
			<a href={back} class="-ml-2 grid size-10 place-items-center rounded-full hover:bg-line/50" aria-label={m.common_back()}>
				<Icon name="back" />
			</a>
		{/if}
		<h1 class="min-w-0 flex-1 truncate font-serif text-xl font-bold">{title}</h1>
		{@render actions?.()}
	</div>
</header>
