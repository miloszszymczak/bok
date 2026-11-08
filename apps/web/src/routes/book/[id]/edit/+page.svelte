<script lang="ts">
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { formatLabel } from '#lib/utils/labels.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const e = $derived(data.edition);
	const w = $derived(data.work);
</script>

<svelte:head><title>{m.edit_title()} · bok</title></svelte:head>

<TopBar title={m.edit_title()} back="/book/{w.id}?e={e.id}" />
<main class="page">
	{#if !data.canEdit}
		<p class="card p-4 text-sm">{m.edit_need_verified()}</p>
	{:else}
		<p class="mb-5 text-sm text-muted">{m.edit_intro()}</p>
		<form method="POST" class="space-y-6">
			<fieldset class="card space-y-4 p-4">
				<legend class="section-title px-1">{m.edit_section_work()}</legend>
				<div><label class="label" for="workTitle">{m.add_field_title()}</label><input class="input" id="workTitle" name="workTitle" required defaultValue={w.title} /></div>
				<div><label class="label" for="authors">{m.add_field_authors()}</label><input class="input" id="authors" name="authors" defaultValue={w.authors} placeholder={m.add_field_authors_hint()} /></div>
				<div class="grid grid-cols-2 gap-3">
					<div><label class="label" for="originalTitle">{m.book_original_title()}</label><input class="input" id="originalTitle" name="originalTitle" defaultValue={w.originalTitle} /></div>
					<div><label class="label" for="firstPublishedYear">{m.edit_first_published()}</label><input class="input" id="firstPublishedYear" name="firstPublishedYear" inputmode="numeric" defaultValue={String(w.firstPublishedYear)} /></div>
				</div>
			</fieldset>

			<fieldset class="card space-y-4 p-4">
				<legend class="section-title px-1">{m.edit_section_edition()}{e.isbn13 ? ` · ISBN ${e.isbn13}` : ''}</legend>
				<div><label class="label" for="title">{m.add_field_title()}</label><input class="input" id="title" name="title" required defaultValue={e.title} /></div>
				<div><label class="label" for="subtitle">{m.add_field_subtitle()}</label><input class="input" id="subtitle" name="subtitle" defaultValue={e.subtitle} /></div>
				<div class="grid grid-cols-2 gap-3">
					<div><label class="label" for="publisher">{m.book_publisher()}</label><input class="input" id="publisher" name="publisher" defaultValue={e.publisher} /></div>
					<div><label class="label" for="publishedYear">{m.add_field_year()}</label><input class="input" id="publishedYear" name="publishedYear" inputmode="numeric" defaultValue={String(e.publishedYear)} /></div>
					<div><label class="label" for="pageCount">{m.book_pages()}</label><input class="input" id="pageCount" name="pageCount" inputmode="numeric" defaultValue={String(e.pageCount)} /></div>
					<div>
						<label class="label" for="format">{m.book_format()}</label>
						<select class="input" id="format" name="format" value={e.format}>
							<option value="">—</option>
							{#each ['paperback', 'hardcover', 'ebook', 'audiobook', 'other'] as f (f)}<option value={f}>{formatLabel(f)}</option>{/each}
						</select>
					</div>
					<div><label class="label" for="language">{m.book_language()}</label><input class="input" id="language" name="language" maxlength="8" defaultValue={e.language} placeholder="pl" /></div>
					<div><label class="label" for="editionStatement">{m.book_edition()}</label><input class="input" id="editionStatement" name="editionStatement" defaultValue={e.editionStatement} /></div>
					<div><label class="label" for="seriesName">{m.edit_series()}</label><input class="input" id="seriesName" name="seriesName" defaultValue={e.seriesName} /></div>
					<div><label class="label" for="seriesPosition">{m.edit_series_position()}</label><input class="input" id="seriesPosition" name="seriesPosition" defaultValue={e.seriesPosition} /></div>
				</div>
				<div><label class="label" for="description">{m.add_field_description()}</label><textarea class="input" id="description" name="description" rows="5" defaultValue={e.description}></textarea></div>
			</fieldset>
			{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
			<button class="btn btn-primary w-full">{m.common_save()}</button>
		</form>
	{/if}
</main>
