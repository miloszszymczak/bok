<script lang="ts">
	import { onMount } from 'svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { live } from '#lib/client/live.svelte.ts';
	import { shortDate } from '#lib/utils/loans.ts';
	import { daysText } from '#lib/utils/reading.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function text(type: string, actor: string, d: Record<string, unknown>) {
		const title = String(d.title ?? '');
		const date = (k: string) => (typeof d[k] === 'string' ? shortDate(d[k] as string) : '');
		const days = Number(d.days ?? 0);
		if (type === 'import_done') return m.notif_import_done({ n: Number(d.matched ?? 0) + Number(d.created ?? 0) });
		if (type === 'loan_request') return m.notif_loan_request({ name: actor, title });
		if (type === 'loan_approved') return d.dueOn ? m.notif_loan_approved_until({ name: actor, title, date: date('dueOn') }) : m.notif_loan_approved({ name: actor, title });
		if (type === 'loan_declined') return m.notif_loan_declined({ name: actor, title });
		if (type === 'loan_lent') return d.dueOn ? m.notif_loan_lent_until({ name: actor, title, date: date('dueOn') }) : m.notif_loan_lent({ name: actor, title });
		if (type === 'loan_extension_request') return m.notif_loan_extension_request({ name: actor, title, date: date('to') });
		if (type === 'loan_extension_answer') return d.approved ? m.notif_loan_extension_yes({ name: actor, title, date: date('dueOn') }) : m.notif_loan_extension_no({ name: actor, title, date: date('dueOn') });
		if (type === 'loan_returned') return m.notif_loan_returned({ name: actor, title });
		if (type === 'loan_due') return days === 0 ? m.notif_loan_due_today({ title }) : days === 1 ? m.notif_loan_due_tomorrow({ title }) : m.notif_loan_due_in({ title, days: daysText(days) });
		if (type === 'loan_overdue')
			return d.side === 'l' ? m.notif_loan_overdue_lender({ name: actor === '—' ? String(d.otherName ?? '—') : actor, title, days: daysText(days) }) : m.notif_loan_overdue({ title, days: daysText(days) });
		if (type === 'follow') return m.notif_follow({ name: actor });
		if (type === 'friend_request') return m.notif_friend_request({ name: actor });
		if (type === 'friend_accept') return m.notif_friend_accept({ name: actor });
		if (type === 'readlist_saved') return m.notif_readlist_saved({ name: actor });
		if (type === 'comment') return m.notif_comment({ name: actor });
		if (type === 'like') return m.notif_like({ name: actor });
		if (type === 'mention') return m.notif_mention({ name: actor });
		return type;
	}
	const href = (n: (typeof data.items)[number]) => ((n.data as { url?: string })?.url ?? (n.actorHandle ? `/u/${n.actorHandle}` : '/notifications'));
	const ago = (iso: string) => {
		const s = (Date.now() - new Date(iso).getTime()) / 1000;
		const rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
		if (s < 60) return rtf.format(-Math.round(s), 'second');
		if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
		if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
		return rtf.format(-Math.round(s / 86400), 'day');
	};

	// Opening the inbox marks everything as read (the list keeps showing which were new).
	onMount(() => {
		if (data.items.some((n) => !n.readAt)) {
			void fetch('?/read', { method: 'POST', body: new FormData(), headers: { 'x-sveltekit-action': 'true' } }).then(() => (live.unread = 0));
		}
	});
</script>

<svelte:head><title>{m.notifications_title()} · bok</title></svelte:head>

<TopBar title={m.notifications_title()} back="/">
	{#snippet actions()}
		<a href="/settings#notifications" class="btn btn-ghost h-10 px-3 text-sm">{m.nav_settings()}</a>
	{/snippet}
</TopBar>
<main class="page">
	{#if data.items.length}
		<ul class="card divide-y divide-line/60" data-testid="inbox">
			{#each data.items as n (n.id)}
				<li>
					<a href={href(n)} class="flex items-center gap-3 p-3 {n.readAt ? '' : 'bg-accent-soft/50'}" data-type={n.type}>
						{#if n.actorAvatar}
							<img src={n.actorAvatar} alt="" class="size-10 shrink-0 rounded-full object-cover" width="40" height="40" />
						{:else}
							<span class="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft font-serif font-bold text-accent">{(n.actorName ?? 'b').slice(0, 1).toUpperCase()}</span>
						{/if}
						<span class="min-w-0 flex-1 text-sm"><span class="block">{text(n.type, n.actorName ?? '—', (n.data ?? {}) as Record<string, unknown>)}</span><span class="text-xs text-muted">{ago(n.createdAt)}</span></span>
						{#if !n.readAt}<span class="size-2 shrink-0 rounded-full bg-accent" aria-label={m.notifications_new()}></span>{/if}
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="card p-6 text-center text-sm text-muted">{m.notifications_empty()}</p>
	{/if}
</main>
