<script lang="ts">
	import BookCover from './BookCover.svelte';
	import Icon from './Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { ScanRecord } from '#lib/client/types.ts';

	let {
		scan,
		online,
		onundo,
		onanother,
		onskip,
		onretry,
		onmovehere,
		placeOf
	}: {
		scan: ScanRecord;
		online: boolean;
		onundo: () => void;
		onanother: () => void;
		onskip: () => void;
		onretry: () => void;
		onmovehere: () => void;
		placeOf: (sectionId: string | null | undefined) => string;
	} = $props();
	const canMoveHere = $derived(scan.status === 'duplicate' && !!scan.sectionId && !!scan.duplicateOf?.some((c) => c.sectionId !== scan.sectionId));

	const b = $derived(scan.book);
	const pending = $derived(scan.status === 'queued' || scan.status === 'sending');
	const faded = $derived(scan.status === 'undone' || scan.status === 'skipped');
</script>

<li class="card flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5 transition {faded ? 'opacity-50' : ''}" data-status={scan.status} data-code={scan.code}>
	{#if b}
		<a href="/book/{b.workId}?e={b.editionId}" class="shrink-0" aria-label={b.title}><BookCover src={b.cover} title={b.title} author={b.authors[0]} width={40} /></a>
	{:else}
		<div class="grid h-[60px] w-10 shrink-0 place-items-center rounded-md bg-line/60 text-muted">
			{#if pending}<span class="size-4 animate-spin rounded-full border-2 border-muted border-t-transparent"></span>{:else}<Icon name="alert" size={18} />{/if}
		</div>
	{/if}

	<div class="min-w-0 flex-1">
		<p class="truncate font-medium {faded ? 'line-through' : ''}">{b?.title ?? scan.code}</p>
		<p class="truncate text-xs text-muted">
			{#if scan.status === 'queued' && !online}
				<Icon name="offline" size={12} class="inline" /> {m.scan_status_offline()}
			{:else if pending}
				{m.scan_status_looking()}
			{:else if scan.status === 'added'}
				<span class="font-semibold text-accent">✓ {scan.sectionId ? m.scan_status_added_to({ shelf: placeOf(scan.sectionId) }) : m.scan_status_added()}</span>
				{#if (scan.otherCopies ?? 0) > 0}· {m.scan_hint_another_copy()}{:else if (scan.sameWorkOtherEditions ?? 0) > 0}· {m.scan_hint_other_edition()}{/if}
			{:else if scan.status === 'duplicate'}
				<span class="font-semibold text-warn">{m.scan_status_duplicate({ count: scan.duplicateOf?.length ?? 1 })}</span>
				{#if scan.duplicateOf?.[0]}· {placeOf(scan.duplicateOf[0].sectionId)}{/if}
			{:else if scan.status === 'moved'}
				<span class="font-semibold text-accent">⇄ {m.scan_status_moved({ from: placeOf(scan.fromSectionId), to: placeOf(scan.sectionId) })}</span>
			{:else if scan.status === 'already_here'}
				<span class="font-semibold text-accent">✓ {m.scan_status_already_here()}</span>
			{:else if scan.status === 'not_owned'}
				<span class="text-warn">{m.scan_status_not_owned()}</span>
			{:else if scan.status === 'not_found'}
				{m.scan_status_not_found()}
			{:else if scan.status === 'invalid'}
				{m.scan_status_invalid()}
			{:else if scan.status === 'undone'}
				{m.scan_status_undone()}
			{:else if scan.status === 'skipped'}
				{m.scan_status_skipped()}
			{:else if scan.status === 'undo_queued'}
				{m.scan_status_undoing()}
			{:else if scan.status === 'error'}
				<span class="text-danger">{scan.error === 'signed_out' ? m.scan_status_signed_out() : m.scan_status_error()}</span>
			{/if}
			{#if pending && scan.localHint === 'owned'}· <span class="text-warn">{m.scan_hint_owned()}</span>{/if}
		</p>
		{#if b?.authors.length && !faded}<p class="truncate text-xs text-muted">{b.authors.join(', ')}</p>{/if}
	</div>

	{#if scan.status === 'duplicate' || scan.status === 'not_found'}
		<!-- Decisions get their own row so the message is never truncated. -->
		<div class="flex w-full gap-2 pl-[52px]">
			{#if scan.status === 'duplicate'}
				{#if canMoveHere}<button class="btn btn-primary h-9 flex-1 px-3 text-sm" onclick={onmovehere}>⇄ {m.scan_move_here()}</button>{/if}
				<button class="btn btn-secondary h-9 flex-1 px-3 text-sm" onclick={onanother}><Icon name="plus" size={16} />{m.scan_add_another()}</button>
			{:else}
				<a class="btn btn-secondary h-9 flex-1 px-3 text-sm" href="/add?isbn={encodeURIComponent(scan.code)}"><Icon name="pencil" size={16} />{m.scan_add_manually()}</a>
			{/if}
			<button class="btn btn-ghost h-9 px-3 text-sm" onclick={onskip}>{m.scan_skip()}</button>
		</div>
	{/if}

	<div class="flex shrink-0 items-center gap-1">
		{#if scan.status === 'duplicate' || scan.status === 'not_found'}
			<!-- actions in the row below -->
		{:else if scan.status === 'error'}
			<button class="btn btn-secondary h-9 px-3 text-sm" onclick={onretry}><Icon name="refresh" size={16} />{m.scan_retry()}</button>
		{:else if pending || scan.status === 'added' || scan.status === 'moved'}
			<button class="btn btn-ghost h-9 px-3 text-sm" onclick={onundo}><Icon name="undo" size={16} />{m.scan_undo()}</button>
		{/if}
	</div>
</li>
