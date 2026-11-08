<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<TopBar title={data.code} back="/search" />
<main class="page">
	<div class="card p-6 text-center">
		<Icon name="alert" class="mx-auto text-warn" size={32} />
		<p class="mt-3 font-semibold">{data.invalid ? m.isbn_invalid() : m.isbn_not_found()}</p>
		<p class="mt-1 text-sm text-muted">{data.invalid ? m.isbn_invalid_hint() : m.isbn_not_found_hint()}</p>
		<div class="mt-5 grid gap-2">
			{#if !data.invalid}<a href="/add?isbn={encodeURIComponent(data.code)}" class="btn btn-primary">{m.scan_add_manually()}</a>{/if}
			<a href="/search" class="btn btn-secondary">{m.isbn_search_title()}</a>
		</div>
	</div>
</main>
