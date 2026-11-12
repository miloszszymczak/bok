<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { toEditable } from '@bok/core';
	import Composer from './Composer.svelte';
	import Icon from './Icon.svelte';
	import PostBody from './PostBody.svelte';
	import ReportDialog from './ReportDialog.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { ago } from '#lib/utils/time.ts';
	import type { PostView } from '@bok/server';

	let { post, link = true, signedIn = true }: { post: PostView; link?: boolean; signedIn?: boolean } = $props();
	// svelte-ignore state_referenced_locally
	let likes = $state(post.likes);
	// svelte-ignore state_referenced_locally
	let liked = $state(post.liked);
	let open = $state(false);
	let menu = $state(false);
	let editing = $state(false);
	let reporting = $state(false);
	let deleted = $state(false);
	const vis = $derived(
		post.visibility === 'public'
			? ({ icon: 'globe', label: m.visibility_public() } as const)
			: post.visibility === 'followers'
				? ({ icon: 'users', label: m.visibility_followers() } as const)
				: post.visibility === 'friends'
					? ({ icon: 'friends', label: m.visibility_friends() } as const)
					: ({ icon: 'lock', label: m.visibility_private() } as const)
	);

	async function toggleLike() {
		if (!signedIn) return goto(`/auth/sign-in?next=/p/${post.id}`);
		liked = !liked;
		likes += liked ? 1 : -1;
		const r = await fetch(`/api/v1/posts/${post.id}/like`, { method: liked ? 'POST' : 'DELETE' });
		if (!r.ok) {
			liked = !liked;
			likes += liked ? 1 : -1;
		}
	}

	async function remove() {
		menu = false;
		if (!confirm(m.post_delete_confirm())) return;
		const r = await fetch(`/api/v1/posts/${post.id}`, { method: 'DELETE' });
		if (r.ok) deleted = true;
	}

	const editable = $derived(toEditable(post.body));
</script>

{#if !deleted}
	<article class="card p-4" data-post={post.id}>
		<header class="flex items-center gap-3">
			<a href="/u/{post.author.handle}" class="shrink-0">
				{#if post.author.avatar}<img src={post.author.avatar} alt="" class="size-10 rounded-full object-cover" width="40" height="40" loading="lazy" />
				{:else}<span class="grid size-10 place-items-center rounded-full bg-accent-soft font-serif font-bold text-accent">{post.author.displayName.slice(0, 1).toUpperCase()}</span>{/if}
			</a>
			<div class="min-w-0 flex-1 leading-tight">
				<a href="/u/{post.author.handle}" class="font-semibold">{post.author.displayName}</a>
				<p class="text-xs text-muted">
					<a href="/p/{post.id}" class="hover:underline">{ago(post.createdAt)}</a>{#if post.editedAt} · {m.post_edited()}{/if} · <span class="inline-block align-[-2px]" title={vis.label}><Icon name={vis.icon} size={13} /><span class="sr-only">{vis.label}</span></span>
				</p>
			</div>
			{#if signedIn}
				<div class="relative">
					<button class="grid size-9 place-items-center rounded-full text-muted hover:bg-line/50" onclick={() => (menu = !menu)} aria-label={m.social_more()} aria-expanded={menu} data-testid="post-menu"><Icon name="more" /></button>
					{#if menu}
						<button class="fixed inset-0 z-40 cursor-default" aria-label={m.common_close()} onclick={() => (menu = false)}></button>
						<div class="absolute right-0 z-50 mt-1 w-44 popover" role="menu">
							{#if post.isMine}
								<button role="menuitem" class="w-full px-4 py-2.5 text-left text-sm" onclick={() => ((menu = false), (editing = true))}>{m.book_edit()}</button>
								<button role="menuitem" class="w-full border-t border-line px-4 py-2.5 text-left text-sm text-danger" onclick={remove}>{m.shelves_delete()}</button>
							{:else}
								<button role="menuitem" class="w-full px-4 py-2.5 text-left text-sm" onclick={() => ((menu = false), (reporting = true))}>{m.social_report()}</button>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</header>

		<div class="mt-3">
			{#if editing}
				<Composer
					initialText={editable.text}
					initialBooks={editable.books}
					visibility={post.visibility}
					spoiler={post.spoiler}
					submitLabel={m.common_save()}
					oncancel={() => (editing = false)}
					onsubmit={async (p) => {
						const r = await fetch(`/api/v1/posts/${post.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
						if (r.ok) {
							editing = false;
							await invalidateAll();
						}
						return r.ok;
					}}
				/>
			{:else if post.spoiler && !open}
				<button class="w-full rounded-xl bg-bg p-4 text-sm text-muted" onclick={() => (open = true)} data-testid="post-spoiler"><Icon name="alert" size={16} class="mr-1 inline align-[-3px]" />{m.spoiler_show()}</button>
			{:else}
				<PostBody nodes={post.nodes} books={post.books} />
			{/if}
		</div>

		<footer class="mt-3 flex items-center gap-2 text-sm text-muted">
			<button class="-my-2 -ml-2 flex h-10 items-center gap-1.5 rounded-lg px-2 font-semibold hover:bg-accent-soft {liked ? 'text-danger' : ''}" onclick={toggleLike} aria-pressed={liked} aria-label={m.post_like()} data-testid="like">
				<Icon name="heart" size={18} class={liked ? 'fill-current' : ''} /><span data-testid="like-count">{likes}</span>
			</button>
			{#if link}
				<a href="/p/{post.id}" class="-my-2 flex h-10 items-center gap-1.5 rounded-lg px-2 font-semibold hover:bg-accent-soft" data-testid="comments-link" aria-label={m.comments_title()}><Icon name="comment" size={18} />{post.comments}</a>
			{:else}
				<span class="flex items-center gap-1.5 px-2 font-semibold"><Icon name="comment" size={18} />{post.comments}</span>
			{/if}
		</footer>
	</article>
{/if}

{#if reporting}<ReportDialog targetType="post" targetId={post.id} name={post.author.displayName} onclose={() => (reporting = false)} />{/if}
