<script lang="ts">
	import BookCover from './BookCover.svelte';
	import Icon from './Icon.svelte';
	import DuePicker from './DuePicker.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/** "I borrowed a book from someone outside bok" (a sibling, a library) — so reminders still work. */
	type Book = { workId: string; editionId: string | null; title: string; authors: string[]; cover: string | null };
	let { book = null, onclose, ondone }: { book?: Book | null; onclose: () => void; ondone: () => void } = $props();
	let picked = $state<Book | null>(null);
	$effect.pre(() => {
		if (book && !picked) picked = book;
	});
	let q = $state('');
	let results = $state<Book[]>([]);
	let lender = $state('');
	let dueOn = $state<string | null>(null);
	let note = $state('');
	let busy = $state(false);
	let failed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function search() {
		clearTimeout(timer);
		timer = setTimeout(async () => {
			const r = await fetch(`/api/v1/suggest/books?q=${encodeURIComponent(q.trim())}`);
			results = r.ok ? await r.json() : [];
		}, 200);
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!picked || !lender.trim()) return;
		busy = true;
		failed = false;
		const r = await fetch('/api/v1/loans', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ kind: 'borrowed', workId: picked.workId, editionId: picked.editionId, lenderName: lender.trim(), dueOn, note })
		});
		busy = false;
		if (r.ok) ondone();
		else failed = true;
	}
</script>

<div class="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={m.loan_borrowed_title()}>
	<button class="flex-1" aria-label={m.common_close()} onclick={onclose}></button>
	<form class="max-h-[85dvh] space-y-4 overflow-y-auto rounded-t-2xl bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onsubmit={submit} data-testid="borrowed-sheet">
		<div class="flex items-center">
			<h2 class="flex-1 font-serif text-lg font-bold">{m.loan_borrowed_title()}</h2>
			<button type="button" class="grid size-10 place-items-center rounded-full hover:bg-line/50" onclick={onclose} aria-label={m.common_close()}><Icon name="x" /></button>
		</div>
		{#if picked}
			<div class="flex items-center gap-3 rounded-xl border border-line p-2" data-testid="borrowed-book">
				<BookCover src={picked.cover} title={picked.title} width={36} />
				<span class="min-w-0 flex-1"><span class="block truncate font-medium">{picked.title}</span><span class="block truncate text-xs text-muted">{picked.authors.join(', ')}</span></span>
				{#if !book}<button type="button" class="grid size-9 place-items-center text-muted" onclick={() => (picked = null)} aria-label={m.common_cancel()}><Icon name="x" size={16} /></button>{/if}
			</div>
		{:else}
			<div>
				<input class="input h-11" bind:value={q} oninput={search} placeholder={m.loan_borrowed_search()} aria-label={m.loan_borrowed_search()} data-testid="borrowed-search" />
				{#if results.length}
					<ul class="card mt-2 max-h-56 divide-y divide-line/60 overflow-y-auto">
						{#each results as r (r.workId)}
							<li>
								<button type="button" class="flex w-full items-center gap-3 px-3 py-2 text-left" onclick={() => (picked = r)} data-result={r.title}>
									<BookCover src={r.cover} title={r.title} width={28} />
									<span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{r.title}</span><span class="block truncate text-xs text-muted">{r.authors.join(', ')}</span></span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
		<div>
			<label for="borrowed-from" class="mb-1 block text-sm font-semibold">{m.loan_borrowed_from()}</label>
			<input id="borrowed-from" class="input h-11" bind:value={lender} maxlength="80" placeholder={m.loan_borrowed_from_placeholder()} />
		</div>
		<DuePicker bind:value={dueOn} />
		<input class="input h-11" bind:value={note} maxlength="500" placeholder={m.loan_note_placeholder()} aria-label={m.loan_note()} />
		{#if failed}<p class="text-sm text-danger" role="alert">{m.loan_failed()}</p>{/if}
		<button class="btn btn-primary w-full" disabled={busy || !picked || !lender.trim()} data-testid="borrowed-submit">{m.loan_borrowed_submit()}</button>
	</form>
</div>
