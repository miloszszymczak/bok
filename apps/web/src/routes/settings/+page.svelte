<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { resizeToWebp } from '#lib/utils/image.ts';
	import { onMount } from 'svelte';
	import { currentSubscription, disablePush, enablePush, isIos, isStandalone, pushSupported } from '#lib/client/push.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const v = $derived(form && 'values' in form && form.values ? form.values : data.form);
	let pushState = $state<'unsupported' | 'ios-install' | 'off' | 'on' | 'denied' | 'busy'>('off');
	onMount(async () => {
		if (!pushSupported() || !page.data.vapidKey) pushState = isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
		else if (Notification.permission === 'denied') pushState = 'denied';
		else pushState = (await currentSubscription()) ? 'on' : 'off';
	});
	async function togglePush() {
		const was = pushState;
		pushState = 'busy';
		if (was === 'on') {
			await disablePush();
			pushState = 'off';
		} else {
			const r = await enablePush(page.data.vapidKey!);
			pushState = r.ok ? 'on' : r.reason === 'denied' ? 'denied' : 'off';
		}
	}
	const typeLabel = (t: string) => (t === 'follow' ? m.notif_type_follow() : t === 'friend_request' ? m.notif_type_friend_request() : t === 'friend_accept' ? m.notif_type_friend_accept() : t === 'readlist_saved' ? m.notif_type_readlist_saved() : t === 'comment' ? m.notif_type_comment() : t === 'like' ? m.notif_type_like() : t === 'mention' ? m.notif_type_mention() : loanTypeLabel(t));
	const loanTypeLabel = (t: string) =>
		({
			loan_request: m.notif_type_loan_request(),
			loan_approved: m.notif_type_loan_approved(),
			loan_declined: m.notif_type_loan_declined(),
			loan_lent: m.notif_type_loan_lent(),
			loan_extension_request: m.notif_type_loan_extension_request(),
			loan_extension_answer: m.notif_type_loan_extension_answer(),
			loan_returned: m.notif_type_loan_returned(),
			loan_due: m.notif_type_loan_due(),
			loan_overdue: m.notif_type_loan_overdue(),
			import_done: m.notif_type_import_done()
		})[t] ?? t;
	const visOptions = [
		['public', m.visibility_public()],
		['followers', m.visibility_followers()],
		['friends', m.visibility_friends()],
		['private', m.visibility_private()]
	] as const;
	let uploading = $state(false);
	let avatarError = $state('');
	const deletionDate = $derived(
		data.deletionRequestedAt ? new Date(new Date(data.deletionRequestedAt).getTime() + 14 * 86400000).toLocaleDateString(getLocale()) : null
	);

	async function onAvatar(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		uploading = true;
		avatarError = '';
		try {
			const blob = await resizeToWebp(file, 512, true);
			const res = await fetch('/api/v1/uploads/avatar', { method: 'POST', body: blob, headers: { 'content-type': 'image/webp' } });
			if (!res.ok) throw new Error(`upload ${res.status}`);
			await invalidateAll();
		} catch (err) {
			avatarError = m.settings_avatar_failed();
			console.error(err);
		} finally {
			uploading = false;
		}
	}
</script>

<svelte:head><title>{m.nav_settings()} · bok</title></svelte:head>

<TopBar title={m.nav_settings()} back="/u/{page.data.profile?.handle}" />
<main class="page space-y-8">
	<section>
		<h2 class="section-title">{m.settings_profile()}</h2>
		<div class="card space-y-4 p-4">
			<div class="flex items-center gap-4">
				{#if page.data.profile?.avatarUrl}
					<img src={page.data.profile.avatarUrl} alt="" class="size-16 rounded-full object-cover ring-1 ring-line" />
				{:else}
					<div class="grid size-16 place-items-center rounded-full bg-accent-soft font-serif text-2xl font-bold text-accent">{v.displayName.slice(0, 1).toUpperCase()}</div>
				{/if}
				<label class="btn btn-secondary h-10 cursor-pointer px-4 text-sm">
					<Icon name="camera" size={18} />{uploading ? m.common_loading() : m.settings_change_photo()}
					<input type="file" accept="image/*" class="sr-only" onchange={onAvatar} disabled={uploading} />
				</label>
			</div>
			{#if avatarError}<p class="field-error">{avatarError}</p>{/if}

			<form method="POST" action="?/profile" use:enhance={() => async ({ update }) => update({ reset: false })} class="space-y-4">
				<div>
					<label class="label" for="displayName">{m.settings_display_name()}</label>
					<input class="input" id="displayName" name="displayName" defaultValue={v.displayName} maxlength="60" required />
				</div>
				<div>
					<label class="label" for="handle">{m.settings_handle()}</label>
					<div class="relative">
						<span class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">@</span>
						<input class="input pl-9" id="handle" name="handle" defaultValue={v.handle} pattern="[a-z0-9_]{'{3,30}'}" autocapitalize="off" autocomplete="off" required />
					</div>
					<p class="mt-1.5 text-xs text-muted">{m.settings_handle_hint()}</p>
				</div>
				<div>
					<label class="label" for="bio">{m.settings_bio()}</label>
					<textarea class="input" id="bio" name="bio" rows="3" maxlength="500" defaultValue={v.bio}></textarea>
				</div>
				<div>
					<label class="label" for="timezone">{m.settings_timezone()}</label>
					<select class="input" id="timezone" name="timezone" value={v.timezone}>
						{#each data.timezones as tz (tz)}<option value={tz}>{tz.replace(/_/g, ' ')}</option>{/each}
					</select>
				</div>
				{#if form?.section === 'profile' && 'error' in form}<p class="field-error" role="alert">{form.error}</p>{/if}
				{#if form?.section === 'profile' && 'saved' in form}<p class="text-sm text-accent" role="status">{m.common_saved()}</p>{/if}
				<button class="btn btn-primary w-full">{m.common_save()}</button>
			</form>
		</div>
	</section>

	<section id="notifications">
		<h2 class="section-title">{m.notifications_title()}</h2>
		<div class="card space-y-4 p-4">
			<div class="flex items-center gap-3">
				<div class="flex-1 text-sm">
					<p class="font-medium">{m.push_this_device()}</p>
					<p class="text-xs text-muted" data-testid="push-state">
						{pushState === 'on' ? m.push_on() : pushState === 'denied' ? m.push_denied() : pushState === 'ios-install' ? m.push_ios_install() : pushState === 'unsupported' ? m.push_unsupported() : m.push_off()}
					</p>
				</div>
				{#if pushState === 'on' || pushState === 'off' || pushState === 'busy'}
					<button class="btn h-9 px-3 text-sm {pushState === 'on' ? 'btn-secondary' : 'btn-primary'}" onclick={togglePush} disabled={pushState === 'busy'}>{pushState === 'on' ? m.push_disable() : m.push_enable()}</button>
				{/if}
			</div>
			<form method="POST" action="?/notifications" use:enhance={() => async ({ update }) => update({ reset: false })} class="space-y-4">
				<table class="w-full text-sm">
					<thead><tr class="text-xs text-muted"><th class="text-left font-medium"></th><th class="w-14 font-medium">{m.channel_inapp()}</th><th class="w-14 font-medium">{m.channel_push()}</th><th class="w-14 font-medium">{m.channel_email()}</th></tr></thead>
					<tbody>
						{#each data.prefs as p (p.type)}
							<tr class="border-t border-line/60">
								<td class="py-2.5">{typeLabel(p.type)}</td>
								{#each ['inapp', 'push', 'email'] as c (c)}
									<td class="text-center"><input type="checkbox" name="{p.type}.{c}" checked={p[c as 'inapp' | 'push' | 'email']} class="size-5 rounded border-line text-accent focus:ring-accent" aria-label="{typeLabel(p.type)} — {c}" /></td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
				<div>
					<p class="label">{m.quiet_hours()}</p>
					<div class="flex items-center gap-2 text-sm">
						<select class="input h-10 w-24" name="quietFrom" value={data.quiet.from ?? ''} aria-label={m.quiet_from()}>
							<option value="">—</option>{#each Array.from({ length: 24 }, (_, i) => i) as h (h)}<option value={h}>{String(h).padStart(2, '0')}:00</option>{/each}
						</select>
						<span class="text-muted">–</span>
						<select class="input h-10 w-24" name="quietTo" value={data.quiet.to ?? ''} aria-label={m.quiet_to()}>
							<option value="">—</option>{#each Array.from({ length: 24 }, (_, i) => i) as h (h)}<option value={h}>{String(h).padStart(2, '0')}:00</option>{/each}
						</select>
					</div>
					<p class="mt-1.5 text-xs text-muted">{m.quiet_hint()}</p>
				</div>
				{#if form?.section === 'notifications' && 'saved' in form}<p class="text-sm text-accent" role="status">{m.common_saved()}</p>{/if}
				<button class="btn btn-secondary w-full">{m.common_save()}</button>
			</form>
		</div>
	</section>

	<section id="privacy">
		<h2 class="section-title">{m.privacy_title()}</h2>
		<form method="POST" action="?/privacy" use:enhance={() => async ({ update }) => update({ reset: false })} class="card space-y-4 p-4">
			{#each [['libraryVisibility', m.privacy_library()], ['lendingVisibility', m.privacy_lending()], ['logVisibility', m.privacy_log_default()]] as [name, label] (name)}
				<div>
					<label class="label" for={name}>{label}</label>
					<select class="input" id={name} {name} value={data.privacy[name as keyof typeof data.privacy]}>
						{#each visOptions as [v, l] (v)}<option value={v}>{l}</option>{/each}
					</select>
				</div>
			{/each}
			<p class="text-xs text-muted">{m.privacy_note()}</p>
			{#if form?.section === 'privacy' && 'saved' in form}<p class="text-sm text-accent" role="status">{m.common_saved()}</p>{/if}
			<button class="btn btn-secondary w-full">{m.common_save()}</button>
		</form>
		{#if data.blocked.length}
			<div class="card mt-3 divide-y divide-line/60">
				<p class="px-4 py-2.5 text-sm font-medium">{m.privacy_blocked()}</p>
				{#each data.blocked as b (b.userId)}
					<form method="POST" action="?/unblock" use:enhance class="flex items-center gap-2 px-4 py-2.5 text-sm">
						<input type="hidden" name="userId" value={b.userId} />
						<span class="flex-1">{b.displayName} <span class="text-muted">@{b.handle}</span></span>
						<button class="btn btn-ghost h-8 px-2 text-xs">{m.social_unblock()}</button>
					</form>
				{/each}
			</div>
		{/if}
	</section>

	<section id="household">
		<h2 class="section-title">{m.household_title()}</h2>
		<div class="card space-y-4 p-4">
			{#each data.households.filter((h) => h.active) as h (h.id)}
				<form method="POST" action="?/renameHousehold" use:enhance={() => async ({ update }) => update({ reset: false })} class="flex gap-2">
					<input type="hidden" name="id" value={h.id} />
					<input class="input h-11 flex-1" name="name" defaultValue={h.name} maxlength="80" aria-label={m.household_name()} />
					<button class="btn btn-secondary h-11 px-3 text-sm">{m.common_save()}</button>
				</form>
			{/each}
			<div>
				<p class="label">{m.household_members()}</p>
				<ul class="flex flex-wrap gap-2 text-sm">
					{#each data.members as mem (mem.userId)}<li class="rounded-full bg-line/60 px-3 py-1">{mem.displayName} <span class="text-muted">@{mem.handle}</span></li>{/each}
				</ul>
			</div>
			{#if form?.section === 'household' && 'inviteUrl' in form && form.inviteUrl}
				<div class="space-y-2 rounded-xl bg-accent-soft p-3">
					<p class="text-sm">{m.household_invite_ready()}</p>
					<input class="input h-10 font-mono text-xs" readonly value={form.inviteUrl} onfocus={(e) => e.currentTarget.select()} data-testid="invite-url" />
					<div class="flex gap-2">
						<button type="button" class="btn btn-secondary h-9 flex-1 text-sm" onclick={() => navigator.clipboard?.writeText(String(form?.section === 'household' && 'inviteUrl' in form ? form.inviteUrl : ''))}><Icon name="copy" size={16} />{m.common_copy()}</button>
						{#if typeof navigator !== 'undefined' && 'share' in navigator}
							<button type="button" class="btn btn-secondary h-9 flex-1 text-sm" onclick={() => navigator.share({ title: 'bok', url: String(form?.section === 'household' && 'inviteUrl' in form ? form.inviteUrl : '') }).catch(() => {})}>{m.common_share()}</button>
						{/if}
					</div>
				</div>
			{:else}
				<form method="POST" action="?/invite" use:enhance={() => async ({ update }) => update({ reset: false })}>
					<button class="btn btn-secondary w-full">{m.household_invite()}</button>
				</form>
				<p class="text-xs text-muted">{m.household_invite_hint()}</p>
			{/if}
			{#if data.households.length > 1}
				<div class="border-t border-line pt-3">
					<p class="label">{m.household_switch()}</p>
					{#each data.households as h (h.id)}
						<div class="flex items-center gap-2 py-1">
							<span class="flex-1 text-sm {h.active ? 'font-semibold' : ''}">{h.name}{h.active ? ` · ${m.household_active()}` : ''}</span>
							{#if !h.active}
								<form method="POST" action="?/switchHousehold" use:enhance><input type="hidden" name="id" value={h.id} /><button class="btn btn-ghost h-8 px-2 text-xs">{m.household_use()}</button></form>
							{/if}
							<form method="POST" action="?/leaveHousehold" use:enhance><input type="hidden" name="id" value={h.id} /><button class="btn btn-ghost h-8 px-2 text-xs text-danger">{m.household_leave()}</button></form>
						</div>
					{/each}
				</div>
			{/if}
			{#if form?.section === 'household' && 'error' in form}<p class="field-error">{form.error}</p>{/if}
		</div>
	</section>

	<section>
		<h2 class="section-title">{m.settings_preferences()}</h2>
		<form method="POST" action="?/preferences" class="card space-y-4 p-4" data-sveltekit-reload>
			<div>
				<label class="label" for="locale">{m.settings_language()}</label>
				<select class="input" id="locale" name="locale" value={getLocale()}>
					<option value="pl">Polski</option>
					<option value="en">English</option>
				</select>
			</div>
			<div>
				<label class="label" for="theme">{m.settings_theme()}</label>
				<select class="input" id="theme" name="theme" value={page.data.theme}>
					<option value="system">{m.settings_theme_system()}</option>
					<option value="light">{m.settings_theme_light()}</option>
					<option value="dark">{m.settings_theme_dark()}</option>
				</select>
			</div>
			<button class="btn btn-secondary w-full">{m.common_save()}</button>
		</form>
	</section>

	<section id="data">
		<h2 class="section-title">{m.settings_data()}</h2>
		<div class="card divide-y divide-line/60">
			<a href="/import" class="flex items-center justify-between px-4 py-3 text-sm font-medium" data-testid="import-link">{m.settings_import()}<Icon name="forward" size={18} /></a>
			<a href="/api/v1/export/goodreads.csv" download class="flex items-center justify-between px-4 py-3 text-sm font-medium" data-testid="export-csv">{m.settings_export_csv()}<Icon name="download" size={18} /></a>
			<a href="/api/v1/export/data.json" download class="flex items-center justify-between px-4 py-3 text-sm font-medium" data-testid="export-json">{m.settings_export_json()}<Icon name="download" size={18} /></a>
		</div>
		<p class="mt-2 px-1 text-xs text-muted">{m.settings_export_note()}</p>
	</section>

	<section>
		<h2 class="section-title">{m.settings_account()}</h2>
		<div class="card divide-y divide-line/60">
			<p class="px-4 py-3 text-sm"><span class="text-muted">{m.auth_email()}:</span> {data.email}</p>
			{#if page.data.profile?.isAdmin}
				<a href="/admin/lookup" class="flex items-center justify-between px-4 py-3 text-sm font-medium">{m.admin_lookup_title()}<Icon name="forward" size={18} /></a>
				<a href="/admin/reports" class="flex items-center justify-between px-4 py-3 text-sm font-medium">{m.admin_reports_title()}<Icon name="forward" size={18} /></a>
			{/if}
			<a href="/privacy" class="flex items-center justify-between px-4 py-3 text-sm">{m.legal_privacy()}<Icon name="forward" size={18} /></a>
			<form method="POST" action="/auth/sign-out">
				<button class="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-danger"><Icon name="logout" size={18} />{m.auth_sign_out()}</button>
			</form>
		</div>
	</section>

	<section id="danger">
		<h2 class="section-title text-danger">{m.settings_danger()}</h2>
		<div class="card space-y-3 border-danger/40 p-4">
			{#if data.deletionRequestedAt}
				<p class="text-sm">{m.settings_delete_scheduled({ date: deletionDate ?? '' })}</p>
				<form method="POST" action="?/cancelDeletion" use:enhance>
					<button class="btn btn-secondary w-full">{m.settings_delete_cancel()}</button>
				</form>
			{:else}
				<p class="text-sm text-muted">{m.settings_delete_explain()}</p>
				<form method="POST" action="?/deleteAccount" use:enhance class="space-y-3">
					<label class="label" for="confirm">{m.settings_delete_confirm_label({ handle: data.form.handle })}</label>
					<input class="input" id="confirm" name="confirm" autocomplete="off" autocapitalize="off" required />
					{#if form?.section === 'danger' && 'error' in form}<p class="field-error">{form.error}</p>{/if}
					<button class="btn btn-danger w-full">{m.settings_delete_cta()}</button>
				</form>
			{/if}
		</div>
	</section>
</main>
