<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';

	let { title = '', back, actions }: { title?: string; back?: string; actions?: Snippet } = $props();
</script>

<header class="sticky top-0 z-20 border-b-2 border-line bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
	<div class="mx-auto flex h-14 max-w-2xl items-center gap-2 px-5">
		{#if back}
			<a href={back} class="-ml-2 grid size-11 place-items-center rounded-lg hover:bg-accent-soft" aria-label={m.common_back()}>
				<Icon name="back" />
			</a>
		{/if}
		<h1 class="min-w-0 flex-1 truncate font-serif text-xl font-semibold">{title}</h1>
		{@render actions?.()}
	</div>
</header>
