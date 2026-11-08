<script lang="ts">
	import { defaultLayout } from '@bok/core';
	import ShelfDesigner from '#lib/components/ShelfDesigner.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let layout = $state(defaultLayout(2, 5, { width: 160, height: 200 }));
</script>

<svelte:head><title>{m.shelves_new_bookcase()} · bok</title></svelte:head>

<TopBar title={m.shelves_new_bookcase()} back="/library/r/{data.room.id}" />
<main class="page">
	<form method="POST" class="space-y-4">
		<div>
			<label class="label" for="name">{m.shelves_bookcase_name()}</label>
			<input class="input" id="name" name="name" required maxlength="80" placeholder={m.shelves_bookcase_placeholder()} />
			<p class="mt-1.5 text-xs text-muted">{m.shelves_in_room({ room: data.room.name })}</p>
		</div>
		<ShelfDesigner bind:layout />
		<input type="hidden" name="layout" value={JSON.stringify(layout)} />
		{#if form?.error}<p class="field-error">{form.error}</p>{/if}
		<button class="btn btn-primary w-full">{m.shelves_create_bookcase()}</button>
	</form>
</main>
