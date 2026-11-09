<script lang="ts">
	import { enhance } from '$app/forms';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>{m.admin_reports_title()} · bok</title></svelte:head>

<TopBar title={m.admin_reports_title()} back="/settings" />
<main class="page space-y-3">
	{#if form?.resolved}<p class="rounded-xl bg-accent-soft px-4 py-2 text-sm" role="status">{m.common_saved()}</p>{/if}
	{#each data.reports as r (r.id)}
		<article class="card space-y-2 p-4" data-report={r.id}>
			<div class="flex items-baseline justify-between gap-2">
				<p class="font-semibold">{r.target_name ?? '—'} <a href="/u/{r.target_handle}" class="text-sm font-normal text-accent">@{r.target_handle}</a></p>
				<span class="text-xs text-muted">{new Date(r.created_at).toLocaleString(getLocale())}</span>
			</div>
			<p class="text-sm"><span class="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-semibold text-warn">{r.reason}</span> · {m.admin_reported_by({ handle: r.reporter_handle ? `@${r.reporter_handle}` : '—' })}{#if r.open_against > 1} · {m.admin_open_against({ n: r.open_against })}{/if}</p>
			<p class="text-xs font-semibold text-muted uppercase">{r.target_type}{#if r.target_link} · <a href={r.target_link} class="text-accent normal-case">{m.admin_open_target()}</a>{/if}</p>
			{#if r.target_text}<p class="rounded-lg border border-line p-2 text-sm whitespace-pre-line" data-testid="target-text">{r.target_text.slice(0, 600)}</p>{/if}
			{#if r.details}<p class="rounded-lg bg-bg p-2 text-sm whitespace-pre-line">{r.details}</p>{/if}
			{#if r.target_bio}<p class="text-xs text-muted">{m.settings_bio()}: {r.target_bio}</p>{/if}
			<form method="POST" action="?/resolve" use:enhance class="flex flex-wrap gap-2 pt-1">
				<input type="hidden" name="id" value={r.id} />
				<button name="action" value="dismiss" class="btn btn-secondary h-9 px-3 text-sm">{m.admin_dismiss()}</button>
				<button name="action" value="hide" class="btn btn-secondary h-9 px-3 text-sm" data-testid="hide">{r.target_type === 'profile' ? m.admin_hide() : m.admin_hide_content()}</button>
				<button name="action" value="suspend" class="btn btn-danger h-9 px-3 text-sm" data-testid="suspend">{m.admin_suspend()}</button>
			</form>
		</article>
	{:else}
		<p class="card p-6 text-center text-sm text-muted">{m.admin_no_reports()}</p>
	{/each}
</main>
