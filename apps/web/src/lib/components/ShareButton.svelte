<script lang="ts">
	import Icon from './Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/** Native share sheet where available, else copy the link. */
	let { url, title }: { url: string; title: string } = $props();
	let copied = $state(false);

	async function share() {
		if (navigator.share) {
			await navigator.share({ title, url }).catch(() => {});
			return;
		}
		await navigator.clipboard?.writeText(url).catch(() => {});
		copied = true;
		setTimeout(() => (copied = false), 1800);
	}
</script>

<button type="button" class="btn btn-primary h-9 px-3 text-sm" onclick={share} data-testid="share"><Icon name="external" size={16} />{copied ? m.common_copied() : m.common_share()}</button>
