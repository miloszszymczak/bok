<script lang="ts">
	import { enhance } from '$app/forms';
	import BookCover from '#lib/components/BookCover.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { coverVariants } from '#lib/utils/cover-upload.ts';
	import { formatLabel } from '#lib/utils/labels.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	type Values = { title?: string; subtitle?: string; authors?: string; publisher?: string; year?: number; pages?: number; format?: string; language?: string; isbn?: string; description?: string };
	const v = $derived<Values>(form?.values ?? { title: data.title, isbn: data.isbn });
	let preview = $state<string | null>(null);
	let file: File | null = null;
	let busy = $state(false);
	let title = $state('');
	$effect.pre(() => {
		title = v.title ?? '';
	});

	function onPhoto(e: Event) {
		file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
		if (preview) URL.revokeObjectURL(preview);
		preview = file ? URL.createObjectURL(file) : null;
	}
</script>

<svelte:head><title>{m.add_title()} · bok</title></svelte:head>

<TopBar title={m.add_title()} back="/scan" />
<main class="page">
	<p class="mb-5 text-sm text-muted">{m.add_intro()} <a class="font-medium text-accent" href="/search?q={encodeURIComponent(title)}">{m.add_search_first()}</a></p>
	<form
		method="POST"
		enctype="multipart/form-data"
		class="space-y-4"
		use:enhance={async ({ formData }) => {
			busy = true;
			formData.delete('photo');
			if (file) {
				const { s, m: md, l } = await coverVariants(file);
				formData.set('cover_s', s, 's.webp');
				formData.set('cover_m', md, 'm.webp');
				formData.set('cover_l', l, 'l.webp');
			}
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<div class="flex items-end gap-4">
			<BookCover src={preview} title={title || '…'} width={88} />
			<label class="btn btn-secondary h-10 cursor-pointer px-4 text-sm">
				<Icon name="camera" size={18} />{m.add_photo()}
				<input type="file" name="photo" accept="image/*" capture="environment" class="sr-only" onchange={onPhoto} />
			</label>
		</div>
		<div>
			<label class="label" for="title">{m.add_field_title()}</label>
			<input class="input" id="title" name="title" required maxlength="300" bind:value={title} />
		</div>
		<div>
			<label class="label" for="subtitle">{m.add_field_subtitle()}</label>
			<input class="input" id="subtitle" name="subtitle" maxlength="300" defaultValue={v.subtitle ?? ''} />
		</div>
		<div>
			<label class="label" for="authors">{m.add_field_authors()}</label>
			<input class="input" id="authors" name="authors" defaultValue={v.authors ?? ''} placeholder={m.add_field_authors_hint()} />
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label class="label" for="publisher">{m.book_publisher()}</label>
				<input class="input" id="publisher" name="publisher" defaultValue={v.publisher ?? ''} />
			</div>
			<div>
				<label class="label" for="year">{m.add_field_year()}</label>
				<input class="input" id="year" name="year" inputmode="numeric" pattern="[0-9]*" maxlength="4" defaultValue={v.year ?? ''} />
			</div>
			<div>
				<label class="label" for="pages">{m.book_pages()}</label>
				<input class="input" id="pages" name="pages" inputmode="numeric" pattern="[0-9]*" maxlength="5" defaultValue={v.pages ?? ''} />
			</div>
			<div>
				<label class="label" for="format">{m.book_format()}</label>
				<select class="input" id="format" name="format" value={v.format ?? ''}>
					<option value="">—</option>
					{#each ['paperback', 'hardcover', 'ebook', 'audiobook', 'other'] as f (f)}<option value={f}>{formatLabel(f)}</option>{/each}
				</select>
			</div>
			<div>
				<label class="label" for="language">{m.book_language()}</label>
				<select class="input" id="language" name="language" value={v.language ?? 'pl'}>
					{#each ['pl', 'en', 'de', 'fr', 'es', 'it', 'uk', 'cs', 'ru'] as l (l)}<option value={l}>{new Intl.DisplayNames([l], { type: 'language' }).of(l)}</option>{/each}
				</select>
			</div>
			<div>
				<label class="label" for="isbn">ISBN</label>
				<input class="input font-mono" id="isbn" name="isbn" inputmode="numeric" defaultValue={v.isbn ?? ''} />
			</div>
		</div>
		<div>
			<label class="label" for="description">{m.add_field_description()}</label>
			<textarea class="input" id="description" name="description" rows="3" defaultValue={v.description ?? ''}></textarea>
		</div>
		<label class="flex items-center gap-3 text-sm">
			<input type="checkbox" name="addToLibrary" checked class="size-5 rounded border-line text-accent focus:ring-accent" />
			{m.add_to_library()}
		</label>
		{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
		<button class="btn btn-primary w-full" disabled={busy}>{busy ? m.common_loading() : m.add_submit()}</button>
	</form>
</main>
