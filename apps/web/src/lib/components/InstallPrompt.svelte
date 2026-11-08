<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let deferred = $state<BeforeInstallPromptEvent | null>(null);
	let ios = $state(false);
	let hidden = $state(true);

	onMount(() => {
		const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
		let dismissed = false;
		try {
			dismissed = localStorage.getItem('install-dismissed') === '1';
		} catch {
			/* storage unavailable */
		}
		if (standalone || dismissed) return;
		ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
		if (ios) hidden = false;
		const onPrompt = (e: Event) => {
			e.preventDefault();
			deferred = e as BeforeInstallPromptEvent;
			hidden = false;
		};
		addEventListener('beforeinstallprompt', onPrompt);
		return () => removeEventListener('beforeinstallprompt', onPrompt);
	});

	function dismiss() {
		hidden = true;
		try {
			localStorage.setItem('install-dismissed', '1');
		} catch {
			/* ignore */
		}
	}

	async function install() {
		if (!deferred) return;
		await deferred.prompt();
		await deferred.userChoice;
		deferred = null;
		hidden = true;
	}
</script>

{#if !hidden}
	<div class="card flex items-start gap-3 p-4">
		<Icon name="download" class="mt-0.5 shrink-0 text-accent" />
		<div class="flex-1 text-sm">
			<p class="font-semibold">{m.install_title()}</p>
			<p class="text-muted">{ios ? m.install_ios() : m.install_body()}</p>
			{#if deferred}<button class="btn btn-primary mt-3 h-9 px-4 text-sm" onclick={install}>{m.install_cta()}</button>{/if}
		</div>
		<button class="grid size-8 place-items-center rounded-full text-muted hover:bg-line/50" onclick={dismiss} aria-label={m.common_dismiss()}><Icon name="x" size={18} /></button>
	</div>
{/if}
