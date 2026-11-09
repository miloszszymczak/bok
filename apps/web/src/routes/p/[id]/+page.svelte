<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Composer from '#lib/components/Composer.svelte';
	import OgMeta from '#lib/components/OgMeta.svelte';
	import PostBody from '#lib/components/PostBody.svelte';
	import PostCard from '#lib/components/PostCard.svelte';
	import ReportDialog from '#lib/components/ReportDialog.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { ago } from '#lib/utils/time.ts';
	import { COMMENT_MAX } from '#lib/utils/limits.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const signedIn = $derived(!!page.data.profile);
	let reportingComment = $state<{ id: string; name: string } | null>(null);
	let open = $state(new Set<string>());

	async function likeComment(c: (typeof data.comments)[number]) {
		await fetch(`/api/v1/comments/${c.id}/like`, { method: c.liked ? 'DELETE' : 'POST' });
		await invalidateAll();
	}
	async function deleteComment(id: string) {
		if (!confirm(m.comment_delete_confirm())) return;
		await fetch(`/api/v1/comments/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>{data.post.author.displayName} · bok</title>
	{#if !data.og}<meta name="robots" content="noindex" />{/if}
</svelte:head>
{#if data.og}
	<OgMeta
		title={m.og_post_title({ name: data.post.author.displayName })}
		description={data.og.spoiler ? m.og_post_spoiler() : (data.og.text ?? '')}
		image={data.og.image}
		url={data.og.url}
		type="article"
	/>
{/if}

<TopBar title={m.post_title()} back={signedIn ? '/' : `/u/${data.post.author.handle}`} />
<main class="page space-y-4">
	<PostCard post={data.post} link={false} {signedIn} />

	<section aria-label={m.comments_title()}>
		<h2 class="section-title">{m.comments_title()} ({data.comments.length})</h2>
		<ul class="space-y-2" data-testid="comments">
			{#each data.comments as c (c.id)}
				<li id="c-{c.id}" class="card p-3" data-comment={c.id}>
					<p class="text-sm"><a href="/u/{c.author.handle}" class="font-semibold">{c.author.displayName}</a> <span class="text-xs text-muted">· {ago(c.createdAt)}</span></p>
					<div class="mt-1 text-[15px]">
						{#if c.spoiler && !open.has(c.id)}
							<button class="text-sm text-muted underline" onclick={() => (open = new Set([...open, c.id]))}>⚠ {m.spoiler_show()}</button>
						{:else}<PostBody nodes={c.nodes} compact />{/if}
					</div>
					<div class="mt-1.5 flex gap-4 text-xs text-muted">
						{#if signedIn}<button onclick={() => likeComment(c)} class={c.liked ? 'text-danger' : ''} aria-pressed={c.liked}>{c.liked ? '♥' : '♡'} {c.likes}</button>{:else}<span>♡ {c.likes}</span>{/if}
						{#if c.canDelete}<button onclick={() => deleteComment(c.id)}>{m.shelves_delete()}</button>
						{:else if signedIn}<button onclick={() => (reportingComment = { id: c.id, name: c.author.displayName })}>{m.social_report()}</button>{/if}
					</div>
				</li>
			{:else}
				<li class="px-1 text-sm text-muted">{m.comments_none()}</li>
			{/each}
		</ul>
	</section>

	{#if signedIn}
		<div class="card p-3">
			<Composer
				compact
				allowVisibility={false}
				maxLength={COMMENT_MAX}
				submitLabel={m.comment_send()}
				onsubmit={async (p) => {
					const r = await fetch(`/api/v1/posts/${data.post.id}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: p.body, spoiler: p.spoiler }) });
					if (r.ok) await invalidateAll();
					return r.ok;
				}}
			/>
		</div>
	{:else}
		<a href="/auth/sign-in?next=/p/{data.post.id}" class="btn btn-primary w-full">{m.comments_sign_in()}</a>
	{/if}
</main>

{#if reportingComment}<ReportDialog targetType="comment" targetId={reportingComment.id} name={reportingComment.name} onclose={() => (reportingComment = null)} />{/if}
