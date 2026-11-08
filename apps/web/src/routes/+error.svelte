<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
</script>

<main class="page grid min-h-[70dvh] place-items-center text-center">
	<div>
		<p class="font-serif text-6xl font-bold text-accent">{page.status}</p>
		<p class="mt-3 text-lg">{page.status === 404 ? m.error_not_found() : (page.error?.message ?? m.error_generic())}</p>
		<a href="/" class="btn btn-secondary mt-6">{m.common_go_home()}</a>
	</div>
</main>
