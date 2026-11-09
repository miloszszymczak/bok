<script lang="ts">
	import type { Snippet } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';

	let {
		person,
		trailing
	}: {
		person: { handle: string; displayName: string; avatar: string | null; bio?: string; followsYou?: boolean; youFollow?: boolean; friends?: boolean };
		trailing?: Snippet;
	} = $props();
</script>

<div class="flex items-center gap-3 p-2.5" data-person={person.handle}>
	<a href="/u/{person.handle}" class="flex min-w-0 flex-1 items-center gap-3">
		{#if person.avatar}
			<img src={person.avatar} alt="" class="size-11 shrink-0 rounded-full object-cover ring-1 ring-line" width="44" height="44" loading="lazy" />
		{:else}
			<span class="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft font-serif text-lg font-bold text-accent">{person.displayName.slice(0, 1).toUpperCase()}</span>
		{/if}
		<span class="min-w-0">
			<span class="block truncate font-semibold">{person.displayName}</span>
			<span class="block truncate text-xs text-muted">
				@{person.handle}
				{#if person.friends}<span class="ml-1 rounded-full bg-accent-soft px-1.5 py-px text-accent">{m.social_friend()}</span>
				{:else if person.followsYou}<span class="ml-1 rounded-full bg-line px-1.5 py-px">{m.social_follows_you()}</span>{/if}
			</span>
		</span>
	</a>
	{@render trailing?.()}
</div>
