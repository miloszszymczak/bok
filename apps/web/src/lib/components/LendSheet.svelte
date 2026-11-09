<script lang="ts">
	import Icon from './Icon.svelte';
	import DuePicker from './DuePicker.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/** Lend one of my copies: to someone on bok (friends first) or just a name. */
	let { copyId, title, onclose, ondone }: { copyId: string; title: string; onclose: () => void; ondone: () => void } = $props();
	type Person = { handle: string; displayName: string; avatar: string | null; friends: boolean };
	let who = $state('');
	let picked = $state<Person | null>(null);
	let people = $state<Person[]>([]);
	let dueOn = $state<string | null>(null);
	let note = $state('');
	let busy = $state(false);
	let failed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function suggest(q: string) {
		const r = await fetch(`/api/v1/suggest/people?q=${encodeURIComponent(q)}`);
		people = r.ok ? await r.json() : [];
	}
	$effect(() => void suggest(''));
	function onInput() {
		picked = null;
		clearTimeout(timer);
		timer = setTimeout(() => suggest(who.trim()), 150);
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!picked && !who.trim()) return;
		busy = true;
		failed = false;
		const r = await fetch('/api/v1/loans', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ kind: 'lend', copyId, borrower: picked?.handle, borrowerName: picked ? undefined : who.trim(), dueOn, note })
		});
		busy = false;
		if (r.ok) ondone();
		else failed = true;
	}
</script>

<div class="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={m.loan_lend_title()}>
	<button class="flex-1" aria-label={m.common_close()} onclick={onclose}></button>
	<form class="max-h-[85dvh] space-y-4 overflow-y-auto rounded-t-2xl bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onsubmit={submit} data-testid="lend-sheet">
		<div class="flex items-center">
			<h2 class="min-w-0 flex-1 font-serif text-lg font-bold"><span class="block">{m.loan_lend_title()}</span><span class="block truncate text-sm font-normal text-muted">{title}</span></h2>
			<button type="button" class="grid size-10 place-items-center rounded-full hover:bg-line/50" onclick={onclose} aria-label={m.common_close()}><Icon name="x" /></button>
		</div>
		<div>
			<label for="lend-who" class="mb-1 block text-sm font-semibold">{m.loan_lend_who()}</label>
			{#if picked}
				<div class="flex items-center gap-2 rounded-xl border border-accent bg-accent-soft px-3 py-2" data-testid="lend-picked">
					<span class="flex-1 font-medium">{picked.displayName} <span class="text-xs text-muted">@{picked.handle}</span></span>
					<button type="button" class="text-sm text-muted" onclick={() => ((picked = null), (who = ''))} aria-label={m.common_cancel()}><Icon name="x" size={16} /></button>
				</div>
			{:else}
				<input id="lend-who" class="input h-11" bind:value={who} oninput={onInput} maxlength="80" autocomplete="off" placeholder={m.loan_lend_who_placeholder()} />
				<p class="mt-1 text-xs text-muted">{m.loan_lend_who_hint()}</p>
				{#if people.length}
					<ul class="card mt-2 max-h-48 divide-y divide-line/60 overflow-y-auto" data-testid="lend-people">
						{#each people as p (p.handle)}
							<li>
								<button type="button" class="flex w-full items-center gap-3 px-3 py-2 text-left" onclick={() => (picked = p)} data-person={p.handle}>
									{#if p.avatar}<img src={p.avatar} alt="" class="size-8 rounded-full object-cover" />{:else}<span class="grid size-8 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent">{p.displayName.slice(0, 1)}</span>{/if}
									<span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{p.displayName}</span><span class="block truncate text-xs text-muted">@{p.handle}{p.friends ? ` · ${m.social_friends()}` : ''}</span></span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</div>
		<DuePicker bind:value={dueOn} />
		<input class="input h-11" bind:value={note} maxlength="500" placeholder={m.loan_note_placeholder()} aria-label={m.loan_note()} />
		{#if failed}<p class="text-sm text-danger" role="alert">{m.loan_failed()}</p>{/if}
		<button class="btn btn-primary w-full" disabled={busy || (!picked && !who.trim())} data-testid="lend-submit">{m.loan_lend_submit()}</button>
	</form>
</div>
