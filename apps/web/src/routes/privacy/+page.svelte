<script lang="ts">
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<svelte:head><title>{m.legal_privacy()} · bok</title></svelte:head>

<TopBar title={m.legal_privacy()} back="/" />
<main class="page prose-sm space-y-4 leading-relaxed">
	<p class="text-sm text-muted">{m.legal_draft_notice()}</p>
	<h2 class="font-serif text-xl font-semibold">{m.privacy_what_title()}</h2>
	<p>{m.privacy_what_body()}</p>
	<h2 class="font-serif text-xl font-semibold">{m.privacy_where_title()}</h2>
	<p>{m.privacy_where_body()}</p>
	<h2 class="font-serif text-xl font-semibold">{m.privacy_cookies_title()}</h2>
	<p>{m.privacy_cookies_body()}</p>
	<h2 class="font-serif text-xl font-semibold">{m.privacy_rights_title()}</h2>
	<p>{m.privacy_rights_body()}</p>
</main>
