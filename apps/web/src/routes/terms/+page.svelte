<script lang="ts">
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<svelte:head><title>{m.legal_terms()} · bok</title></svelte:head>

<TopBar title={m.legal_terms()} back="/" />
<main class="page space-y-4 leading-relaxed">
	<p class="text-sm text-muted">{m.legal_draft_notice()}</p>
	<p>{m.terms_body_1()}</p>
	<p>{m.terms_body_2()}</p>
	<p>{m.terms_body_3()}</p>
</main>
