<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';

	let { targetType, targetId, name, onclose }: { targetType: 'post' | 'comment' | 'readlist'; targetId: string; name: string; onclose: () => void } = $props();
	let reason = $state('spam');
	let details = $state('');
	let sent = $state(false);
	const reasons = ['spam', 'abuse', 'inappropriate', 'impersonation', 'other'];
	const label = (r: string) => (r === 'spam' ? m.report_spam() : r === 'abuse' ? m.report_abuse() : r === 'inappropriate' ? m.report_inappropriate() : r === 'impersonation' ? m.report_impersonation() : m.report_other());

	async function send(e: SubmitEvent) {
		e.preventDefault();
		const r = await fetch('/api/v1/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetType, targetId, reason, details }) });
		sent = r.ok;
		if (r.ok) setTimeout(onclose, 1200);
	}
</script>

<div class="fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center" role="dialog" aria-modal="true" aria-label={m.social_report()}>
	<form onsubmit={send} class="w-full max-w-md space-y-3 rounded-t-2xl bg-bg p-5 sm:rounded-2xl">
		<h2 class="font-serif text-lg font-bold">{m.report_content_title({ name })}</h2>
		{#if sent}
			<p class="text-sm" role="status">{m.social_reported()}</p>
		{:else}
			<fieldset class="space-y-1.5">
				{#each reasons as r (r)}<label class="flex items-center gap-3 text-sm"><input type="radio" bind:group={reason} value={r} class="size-4 border-line text-accent focus:ring-accent" />{label(r)}</label>{/each}
			</fieldset>
			<textarea class="input" bind:value={details} rows="3" maxlength="2000" placeholder={m.report_details()}></textarea>
			<div class="flex gap-2"><button class="btn btn-primary flex-1" data-testid="send-report">{m.social_report_send()}</button><button type="button" class="btn btn-secondary" onclick={onclose}>{m.common_cancel()}</button></div>
		{/if}
	</form>
</div>
