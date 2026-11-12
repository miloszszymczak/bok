<script lang="ts">
	import Icon from './Icon.svelte';
	import { goto } from '$app/navigation';
	import { m } from '#lib/paraglide/messages.js';
	import { STATUS_ORDER, statusLabel, statusTone, type Status } from '#lib/utils/reading.ts';

	/** Compact status chip with a menu. Read / DNF open the book's finish sheet. */
	let { workId, status = $bindable(null) }: { workId: string; status?: Status | null } = $props();
	let open = $state(false);
	let busy = $state(false);

	async function choose(s: Status | null) {
		open = false;
		if (s === 'read' || s === 'dnf') {
			await goto(`/book/${workId}?finish=1`);
			return;
		}
		const prev = status;
		status = s;
		busy = true;
		const res = await fetch('/api/v1/reading/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workId, status: s }) }).catch(() => null);
		if (!res?.ok) status = prev;
		busy = false;
	}
</script>

<div class="relative shrink-0">
	<button
		type="button"
		class="rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap {statusTone(status)} {busy ? 'opacity-60' : ''}"
		onclick={() => (open = !open)}
		aria-haspopup="menu"
		aria-expanded={open}
		data-status-chip={status ?? 'none'}
	>
		{status ? statusLabel(status) : `+ ${m.status_add()}`}
	</button>
	{#if open}
		<button type="button" class="fixed inset-0 z-40 cursor-default" aria-label={m.common_close()} onclick={() => (open = false)}></button>
		<div class="absolute right-0 z-50 mt-1 w-48 popover" role="menu">
			{#each STATUS_ORDER as s (s)}
				<button type="button" role="menuitem" class="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-line/40 {status === s ? 'font-semibold' : ''}" onclick={() => choose(s)}>
					{statusLabel(s)}{#if status === s}<Icon name="check" size={16} class="text-accent" />{/if}
				</button>
			{/each}
			{#if status}
				<button type="button" role="menuitem" class="w-full border-t border-line px-3 py-2.5 text-left text-sm text-muted hover:bg-line/40" onclick={() => choose(null)}>{m.status_clear()}</button>
			{/if}
		</div>
	{/if}
</div>
