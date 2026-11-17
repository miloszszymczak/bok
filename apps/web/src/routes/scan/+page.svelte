<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto, replaceState } from '$app/navigation';
	import { looksLikeOurShelfCode, normalizeShelfCode, parseIdentifier, uuidv7 } from '@bok/core';
	import { liveQuery } from 'dexie';
	import Icon from '#lib/components/Icon.svelte';
	import InventoryPanel from '#lib/components/InventoryPanel.svelte';
	import ScanCard from '#lib/components/ScanCard.svelte';
	import ScanTarget from '#lib/components/ScanTarget.svelte';
	import SectionPicker from '#lib/components/SectionPicker.svelte';
	import Verdict, { type VerdictState } from '#lib/components/Verdict.svelte';
	import { openDb, type BokDb } from '#lib/client/db.ts';
	import { findLocal, findReading, refreshLibrary, cacheAdd, loadTree, orderedPlaces } from '#lib/client/library-cache.ts';
	import { Inventory } from '#lib/client/inventory.svelte.ts';
	import { ScanQueue } from '#lib/client/sync.ts';
	import type { CheckResult, ScanRecord, ScanResult, StorageTree } from '#lib/client/types.ts';
	import { Scanner, bandRect, toCoverSpace } from '#lib/scanner/camera.ts';
	import { ScanFilter } from '#lib/scanner/filter.ts';
	import { beep, unlockAudio } from '#lib/scanner/feedback.ts';
	import { listenWedge } from '#lib/scanner/wedge.ts';
	import { m } from '#lib/paraglide/messages.js';

	type Mode = 'add' | 'move' | 'check';
	type CamState = 'idle' | 'starting' | 'on' | 'denied' | 'unavailable';

	const userId = page.data.user?.id as string;
	let db: BokDb;
	let queue: ScanQueue;
	let scanner: Scanner | null = null;
	const filter = new ScanFilter();

	let mode = $state<Mode>(readMode());
	let cam = $state<CamState>('idle');
	let online = $state(true);
	let torch = $state(false);
	let zoomed = $state(false);
	let caps = $state<{ torch: boolean; zoom: { min: number; max: number } | null }>({ torch: false, zoom: null });
	let scans = $state<ScanRecord[]>([]);
	let verdict = $state<VerdictState | null>(null);
	let verdictAdding = $state(false);
	let manualOpen = $state(false);
	let manualCode = $state('');
	let flash = $state(false);
	let band = $state<{ x: number; y: number; w: number; h: number } | null>(null);
	let notice = $state<{ text: string; tone: 'ok' | 'warn' } | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	let wedgeSeen = $state(false);
	/** ?assign=<shelf>: the next non-book code becomes that shelf's label. */
	let assignTo = $state<string | null>(page.url.searchParams.get('assign'));
	let assigning = $state(false);
	let engine = $state('');
	const sessionStart = Date.now();
	let tree = $state<StorageTree | null>(null);
	let target = $state<string | null>(null);
	let pickerOpen = $state(false);
	let inv = $state<Inventory | null>(null);

	const places = $derived(orderedPlaces(tree));
	const placeById = $derived(new Map(places.map((p) => [p.sectionId, p])));
	const targetPlace = $derived(target ? (placeById.get(target) ?? null) : null);
	const targetIndex = $derived(places.findIndex((p) => p.sectionId === target));
	const isLast = $derived(targetIndex === places.length - 1);
	const invPlace = $derived(inv ? (placeById.get(inv.sectionId) ?? null) : null);
	const assignPlace = $derived(assignTo ? (placeById.get(assignTo) ?? null) : null);
	/** Shelf labels on this device (works offline): normalized code → shelf. */
	const shelfByCode = $derived(new Map(places.filter((p) => p.code).map((p) => [p.code!, p.sectionId])));
	const placeName = (p: { containerName: string; label: string } | null | undefined) => (p ? `${p.containerName} ${p.label}` : '');

	function showNotice(text: string, tone: 'ok' | 'warn') {
		notice = { text, tone };
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), 2200);
	}

	function placeOf(id: string | null | undefined) {
		if (!id) return m.shelves_unsorted();
		const p = placeById.get(id);
		return p ? `${p.containerName} ${p.label}` : '…';
	}

	function setTarget(id: string | null) {
		target = id;
		filter.reset();
		try {
			if (id) localStorage.setItem('scan-target', id);
			else localStorage.removeItem('scan-target');
		} catch {
			/* ignore */
		}
	}

	function nextShelf() {
		const next = places[targetIndex + 1];
		if (next) setTarget(next.sectionId);
	}

	let video: HTMLVideoElement;
	let viewport: HTMLDivElement;

	const sessionAdded = $derived(scans.filter((s) => s.status === 'added' && s.scannedAt >= sessionStart).length);
	const pendingCount = $derived(scans.filter((s) => s.status === 'queued' || s.status === 'sending' || s.status === 'undo_queued').length);
	const manualValid = $derived(!!parseIdentifier(manualCode) || !!normalizeShelfCode(manualCode));

	function readMode(): Mode {
		try {
			const v = sessionStorage.getItem('scan-mode');
			return v === 'check' || v === 'move' ? v : 'add';
		} catch {
			return 'add';
		}
	}

	function setMode(next: Mode) {
		mode = next;
		verdict = null;
		filter.reset();
		try {
			sessionStorage.setItem('scan-mode', next);
		} catch {
			/* ignore */
		}
	}

	onMount(() => {
		db = openDb(userId);
		queue = new ScanQueue(db);
		void queue.init();
		void refreshLibrary(db);

		// Shelf target: ?target= wins, else the last one used on this device (if it still exists).
		const params = page.url.searchParams;
		const fromUrl = params.get('target');
		let saved: string | null = null;
		try {
			saved = localStorage.getItem('scan-target');
		} catch {
			/* ignore */
		}
		if (fromUrl) setTarget(fromUrl);
		else target = saved;
		const invId = params.get('inventory');
		if (invId) {
			inv = new Inventory(db, invId);
			void inv.init();
		}
		void loadTree(db, { refresh: false }).then((t) => {
			if (t) tree = t;
			return loadTree(db);
		}).then((t) => {
			if (!t) return;
			tree = t;
			if (target && !orderedPlaces(t).some((p) => p.sectionId === target)) setTarget(null);
		});

		online = navigator.onLine;
		const setOnline = () => {
			online = navigator.onLine;
			if (online) void refreshLibrary(db);
		};
		addEventListener('online', setOnline);
		addEventListener('offline', setOnline);

		// Most recent 60 scans, live from IndexedDB.
		const sub = liveQuery(() => db.scans.orderBy('scannedAt').reverse().limit(60).toArray()).subscribe((rows) => (scans = rows));

		const onVisibility = () => {
			if (document.hidden) scanner?.pause();
			else scanner?.resume();
		};
		document.addEventListener('visibilitychange', onVisibility);
		const onResize = () => updateBand();
		addEventListener('resize', onResize);

		let granted = false;
		try {
			granted = localStorage.getItem('camera-ok') === '1';
		} catch {
			/* ignore */
		}
		if (granted) void startCamera();
		// USB / Bluetooth scanners (keyboard mode) feed the same pipeline as the camera.
		const offWedge = listenWedge((code) => {
			wedgeSeen = true;
			accept(code, null, 'wedge');
		});
		// Auto-started cameras have no user gesture yet: unlock the beep on the first tap anywhere.
		addEventListener('pointerdown', unlockAudio, { once: true });

		return () => {
			offWedge();
			clearTimeout(noticeTimer);
			sub.unsubscribe();
			queue.destroy();
			scanner?.stop();
			removeEventListener('online', setOnline);
			removeEventListener('offline', setOnline);
			removeEventListener('resize', onResize);
			removeEventListener('pointerdown', unlockAudio);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	async function startCamera() {
		unlockAudio();
		if (!navigator.mediaDevices?.getUserMedia) {
			cam = 'unavailable';
			return;
		}
		cam = 'starting';
		let forceZxing = false;
		try {
			forceZxing = localStorage.getItem('scanner-engine') === 'zxing';
		} catch {
			/* ignore */
		}
		scanner ??= new Scanner({ onCode, onStats: (s) => (engine = `${s.engine} ${s.ms}ms`), forceZxing });
		try {
			await scanner.start(video);
			caps = scanner.caps;
			cam = 'on';
			updateBand();
			try {
				localStorage.setItem('camera-ok', '1');
			} catch {
				/* ignore */
			}
		} catch (e) {
			const name = (e as DOMException).name;
			cam = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable';
			try {
				localStorage.removeItem('camera-ok');
			} catch {
				/* ignore */
			}
		}
	}

	function updateBand() {
		if (!video?.videoWidth || !viewport) return;
		const r = bandRect(video.videoWidth, video.videoHeight);
		const b = toCoverSpace(r, video.videoWidth, video.videoHeight, viewport.clientWidth, viewport.clientHeight);
		// Keep the drawn guide clear of the top buttons and the mode switch (decoding still uses the full band).
		const top = Math.max(b.y, 96);
		const bottom = Math.min(b.y + b.h, viewport.clientHeight - 96);
		const x = Math.max(b.x, 12);
		band = { x, y: top, w: Math.min(b.w, viewport.clientWidth - 2 * x), h: Math.max(bottom - top, 60) };
	}

	function onCode(raw: string, addon: string | null) {
		const accepted = filter.push(raw, performance.now());
		if (accepted) accept(accepted, addon, 'camera');
	}

	function flashBand() {
		flash = true;
		setTimeout(() => (flash = false), 180);
	}

	/** Every code — camera, hardware scanner or typed — ends up here: shelf label, book, or neither. */
	function accept(raw: string, addon: string | null, source: 'camera' | 'wedge' | 'manual') {
		const feedback = source !== 'manual';
		if (assignTo) {
			void assignLabel(raw, feedback);
			return;
		}
		const label = normalizeShelfCode(raw);
		const shelf = label ? shelfByCode.get(label) : undefined;
		if (shelf) {
			flashBand();
			if (feedback) beep('ok');
			void switchShelf(shelf);
			return;
		}
		const id = parseIdentifier(raw, addon ?? undefined);
		if (!id || id.kind === 'ean') {
			void unknownCode(raw, feedback);
			return;
		}
		flashBand();
		route(id.kind === 'isbn' ? id.isbn13 : id.issn, id.kind === 'issn' ? id.issue : null, feedback);
	}

	/** Not a book and not a label we know on this device: maybe a label assigned elsewhere. */
	async function unknownCode(raw: string, feedback: boolean) {
		const label = normalizeShelfCode(raw);
		if (label && navigator.onLine) {
			const res = await fetch(`/api/v1/shelf-codes?code=${encodeURIComponent(label)}`).catch(() => null);
			const sectionId = res?.ok ? ((await res.json()) as { sectionId: string | null }).sectionId : null;
			if (sectionId) {
				const t = await loadTree(db);
				if (t) tree = t;
				if (feedback) beep('ok');
				void switchShelf(sectionId);
				return;
			}
		}
		// A product barcode or an unknown label: tell the user, don't record it.
		showNotice(label && looksLikeOurShelfCode(label) ? m.scan_unknown_label() : m.scan_not_book(), 'warn');
		if (feedback) beep('warn');
	}

	/** A shelf label was scanned: that shelf becomes the target / the inventory moves on / it opens. */
	async function switchShelf(id: string) {
		const name = placeName(placeById.get(id));
		if (inv) {
			if (inv.sectionId === id) return;
			// Labels make shelf-by-shelf inventory hands-free: the finished shelf's report is saved.
			if (!inv.finished && inv.ready && (inv.seen.length || inv.items.length)) await inv.finish();
			inv = new Inventory(db, id);
			void inv.init();
			replaceState(`/scan?inventory=${id}`, {});
			showNotice(m.scan_shelf_switched({ shelf: name }), 'ok');
			return;
		}
		if (mode === 'check') {
			await goto(`/library/s/${id}`);
			return;
		}
		setTarget(id);
		showNotice(m.scan_shelf_switched({ shelf: name }), 'ok');
	}

	async function assignLabel(raw: string, feedback: boolean) {
		if (assigning || !assignTo) return;
		const id = parseIdentifier(raw);
		const code = normalizeShelfCode(raw);
		if ((id && id.kind !== 'ean') || !code) {
			showNotice(id && id.kind !== 'ean' ? m.scan_assign_book() : m.scan_unknown_label(), 'warn');
			if (feedback) beep('warn');
			return;
		}
		if (!navigator.onLine) {
			showNotice(m.scan_assign_offline(), 'warn');
			return;
		}
		assigning = true;
		const shelf = assignTo;
		const res = await fetch(`/api/v1/sections/${shelf}/code`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) }).catch(() => null);
		assigning = false;
		if (res?.ok) {
			if (feedback) beep('ok');
			flashBand();
			showNotice(m.scan_assign_done({ shelf: placeName(assignPlace) }), 'ok');
			const t = await loadTree(db);
			if (t) tree = t;
			setTimeout(() => void goto(`/library/s/${shelf}`), 900);
			return;
		}
		if (feedback) beep('warn');
		if (res?.status === 409) {
			const r = (await res.json()) as { place: { containerName: string; label: string } | null };
			showNotice(m.scan_assign_taken({ shelf: placeName(r.place) }), 'warn');
		} else showNotice(m.scan_assign_failed(), 'warn');
	}

	/** One accepted code → the current mode's action. */
	function route(code: string, addon: string | null, feedback: boolean) {
		if (inv) {
			void inv.scan(code).then((r) => feedback && beep(r === 'confirmed' ? 'ok' : 'warn'));
			return;
		}
		if (feedback) beep('ok');
		if (mode === 'add') void queue.enqueue(code, addon, { kind: 'add', sectionId: target });
		else if (mode === 'move' && target) void queue.enqueue(code, addon, { kind: 'move', sectionId: target });
		else void check(code);
	}

	async function check(code: string) {
		const local = await findLocal(db, code);
		const cachedCount = await db.editions.count();
		const cachedReading = await findReading(db, code, local?.workId);
		verdict = {
			reading: cachedReading ?? null,
			code,
			loading: navigator.onLine,
			offline: !navigator.onLine,
			book: local,
			copies: local?.copies ?? [],
			sameWorkOtherEditions: 0,
			notFound: false,
			cachedCount
		};
		if (!navigator.onLine) return;
		try {
			const res = await fetch(`/api/v1/check?code=${encodeURIComponent(code)}`);
			if (!res.ok) throw new Error(String(res.status));
			const r = (await res.json()) as CheckResult;
			if (verdict?.code !== code) return; // a newer scan replaced it
			verdict = {
				...verdict,
				loading: false,
				book: r.book ?? verdict.book,
				copies: r.copies,
				sameWorkOtherEditions: r.sameWorkOtherEditions,
				notFound: r.status !== 'found',
				reading: r.reading ?? verdict.reading,
				borrowed: r.borrowed ?? []
			};
		} catch {
			if (verdict?.code === code) verdict = { ...verdict, loading: false, offline: true };
		}
	}

	async function addFromVerdict() {
		if (!verdict) return;
		verdictAdding = true;
		const code = verdict.code;
		try {
			const res = await fetch('/api/v1/scans', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: uuidv7(), code, force: true })
			});
			const r = (await res.json()) as ScanResult;
			if (r.status === 'added' && verdict?.code === code) {
				await cacheAdd(db, r.book, r.copy);
				verdict = { ...verdict, copies: [...verdict.copies, r.copy], book: r.book };
			}
		} catch {
			await queue.enqueue(code, null); // offline: fall back to the queue
		} finally {
			verdictAdding = false;
		}
	}

	async function toggleTorch() {
		torch = !torch;
		await scanner?.setTorch(torch).catch(() => (torch = false));
	}

	async function toggleZoom() {
		if (!caps.zoom) return;
		zoomed = !zoomed;
		await scanner?.setZoom(zoomed ? Math.min(2, caps.zoom.max) : caps.zoom.min).catch(() => (zoomed = false));
	}

	function onTapViewport(e: PointerEvent) {
		if (cam !== 'on' || !viewport) return;
		const r = viewport.getBoundingClientRect();
		void scanner?.focusAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
	}

	function submitManual(e: SubmitEvent) {
		e.preventDefault();
		if (!manualValid) return;
		accept(manualCode.trim(), null, 'manual');
		manualCode = '';
	}

	async function clearDone() {
		await db.scans.where('status').anyOf('undone', 'skipped', 'invalid').delete();
		await db.scans
			.where('status')
			.equals('added')
			.and((s) => s.scannedAt < sessionStart)
			.delete();
	}

	function undo(s: ScanRecord) {
		filter.forget(s.code);
		void queue.undo(s.id);
	}
</script>

<svelte:head><title>{m.nav_scan()} · bok</title></svelte:head>

<div class="fixed inset-0 z-40 flex flex-col bg-bg">
	<!-- Camera -->
	<div bind:this={viewport} class="relative h-[46dvh] shrink-0 overflow-hidden bg-black" onpointerdown={onTapViewport} role="presentation">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={video} class="h-full w-full object-cover" playsinline muted autoplay onloadedmetadata={updateBand}></video>

		{#if cam === 'on' && band}
			<div
				class="pointer-events-none absolute rounded-xl border-2 transition-colors duration-150 {flash ? 'border-accent bg-accent/25' : 'border-white/90'}"
				style="left:{band.x}px;top:{band.y}px;width:{band.w}px;height:{band.h}px;box-shadow:0 0 0 100vmax rgb(0 0 0 / 0.45)"
			>
				<div class="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-red-500/80"></div>
			</div>
			<p class="pointer-events-none absolute inset-x-0 px-16 text-center text-sm font-medium text-white drop-shadow" style="top:{Math.max(band.y - 30, 60)}px">
				{notice ? notice.text : assignTo ? m.scan_assign_aim({ shelf: placeName(assignPlace) }) : inv ? m.inventory_aim() : mode === 'check' ? m.scan_aim_check() : mode === 'move' ? m.scan_aim_move() : m.scan_aim()}
			</p>
		{:else}
			<div class="absolute inset-0 grid place-items-center p-6 text-center text-white">
				{#if cam === 'starting'}
					<span class="size-8 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
				{:else if cam === 'denied'}
					<div>
						<Icon name="camera" size={36} class="mx-auto opacity-80" />
						<p class="mt-3 font-semibold">{m.scan_denied()}</p>
						<p class="mt-1 text-sm opacity-80">{m.scan_denied_hint()}</p>
						<button class="btn btn-secondary mt-4 h-10" onclick={startCamera}>{m.scan_try_again()}</button>
					</div>
				{:else if cam === 'unavailable'}
					<div>
						<Icon name="camera" size={36} class="mx-auto opacity-80" />
						<p class="mt-3 font-semibold">{m.scan_unavailable()}</p>
						<p class="mt-1 text-sm opacity-80">{m.scan_unavailable_hint()}</p>
					</div>
				{:else}
					<button class="btn btn-primary h-14 px-6 text-lg" onclick={startCamera}><Icon name="camera" />{m.scan_start()}</button>
				{/if}
			</div>
		{/if}

		<!-- Top controls -->
		<div class="absolute inset-x-0 top-0 flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
			<a href="/library" class="grid size-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur" aria-label={m.common_close()}><Icon name="x" /></a>
			{#if !online}
				<span class="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white"><Icon name="offline" size={14} />{m.scan_offline_badge()}</span>
			{/if}
			{#if wedgeSeen}
				<span class="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white" data-testid="wedge-badge"><Icon name="barcode" size={14} />{m.scan_wedge_badge()}</span>
			{/if}
			<span class="flex-1"></span>
			{#if caps.zoom}
				<button class="grid size-11 place-items-center rounded-full text-white backdrop-blur {zoomed ? 'bg-white/90 text-black' : 'bg-black/50'}" onclick={toggleZoom} aria-pressed={zoomed} aria-label={m.scan_zoom()}>
					<span class="text-sm font-bold">{zoomed ? '2×' : '1×'}</span>
				</button>
			{/if}
			{#if caps.torch}
				<button class="grid size-11 place-items-center rounded-full backdrop-blur {torch ? 'bg-yellow-300 text-black' : 'bg-black/50 text-white'}" onclick={toggleTorch} aria-pressed={torch} aria-label={m.scan_torch()}><Icon name="zap" /></button>
			{/if}
		</div>

		<!-- Mode switch -->
		{#if !inv && !assignTo}
			<div class="absolute inset-x-0 bottom-6 flex justify-center">
				<div class="flex rounded-full bg-black/55 p-1 text-sm font-semibold text-white backdrop-blur" role="tablist">
					<button role="tab" aria-selected={mode === 'add'} class="rounded-full px-3.5 py-2 {mode === 'add' ? 'bg-white text-black' : ''}" onclick={() => setMode('add')}>{m.scan_mode_add()}</button>
					<button role="tab" aria-selected={mode === 'move'} class="rounded-full px-3.5 py-2 {mode === 'move' ? 'bg-white text-black' : ''}" onclick={() => setMode('move')}>{m.scan_mode_move()}</button>
					<button role="tab" aria-selected={mode === 'check'} class="flex items-center gap-1.5 rounded-full px-3.5 py-2 {mode === 'check' ? 'bg-white text-black' : ''}" onclick={() => setMode('check')}><Icon name="store" size={16} />{m.scan_mode_check()}</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Results -->
	<div class="-mt-4 flex min-h-0 flex-1 flex-col rounded-t-2xl bg-bg">
		{#if notice}
			<p class="mx-4 mt-3 rounded-lg border-2 border-outline px-3 py-2 text-sm font-bold {notice.tone === 'ok' ? 'bg-accent text-accent-ink' : 'bg-apricot text-accent-ink'}" role="status" data-testid="scan-notice">{notice.text}</p>
		{/if}
		{#if assignTo}
			<div class="space-y-3 px-4 pt-4" data-testid="assign-panel">
				<div class="flex items-center gap-2">
					<p class="min-w-0 flex-1 truncate text-sm"><span class="font-semibold">{m.scan_assign_title()}</span> <span class="text-muted">· {placeName(assignPlace) || '…'}</span></p>
					<a href="/library/s/{assignTo}" class="btn btn-secondary h-9 px-3 text-sm">{m.common_cancel()}</a>
				</div>
				<p class="text-sm text-muted">{m.scan_assign_hint()}</p>
				<form class="flex gap-2" onsubmit={submitManual}>
					<input class="input h-11 flex-1 font-mono tracking-wider" bind:value={manualCode} autocomplete="off" autocapitalize="characters" enterkeyhint="go" aria-label={m.scan_manual_label()} placeholder="BOK-…" data-testid="assign-input" />
					<button class="btn btn-primary h-11 px-4" disabled={!normalizeShelfCode(manualCode) || assigning}>{m.common_ok()}</button>
				</form>
			</div>
		{:else if inv}
			<div class="flex items-center gap-2 px-4 pt-4 pb-2">
				<p class="min-w-0 flex-1 truncate text-sm">
					<span class="font-semibold">{m.inventory_title()}</span>
					<span class="text-muted">· {invPlace ? `${invPlace.containerName} ${invPlace.label}` : '…'}</span>
				</p>
				{#if inv.finished}
					<a href="/library/s/{inv.sectionId}" class="btn btn-secondary h-9 px-3 text-sm">{m.inventory_back()}</a>
				{:else}
					<button class="btn btn-primary h-9 px-3 text-sm" onclick={() => inv?.finish()} disabled={inv.saving || !inv.ready} data-testid="inventory-finish">{m.inventory_finish()}</button>
				{/if}
			</div>
		{:else if mode !== 'check'}
			<div class="pt-4">
				<ScanTarget place={targetPlace} onpick={() => (pickerOpen = true)} onnext={nextShelf} {isLast} />
			</div>
			{#if mode === 'move' && !target}<p class="px-4 pb-2 text-sm text-warn">{m.scan_move_needs_target()}</p>{/if}
		{/if}
		{#if !inv && !assignTo}
		<div class="flex items-center gap-2 px-4 pt-2 pb-2">
			<p class="flex-1 text-sm">
				{#if mode !== 'check'}
					<span class="font-semibold">{m.scan_session_count({ count: sessionAdded })}</span>
					{#if pendingCount}<span class="text-muted"> · {m.scan_pending_count({ count: pendingCount })}</span>{/if}
				{:else}
					<span class="font-semibold">{m.scan_check_title()}</span>
				{/if}
			</p>
			{#if mode !== 'check' && scans.length}
				<button class="btn btn-ghost h-9 px-3 text-sm" onclick={clearDone}>{m.scan_clear()}</button>
			{/if}
			<button class="btn btn-secondary h-9 px-3 text-sm" onclick={() => (manualOpen = !manualOpen)} aria-expanded={manualOpen}><Icon name="keyboard" size={18} />{m.scan_type_code()}</button>
		</div>
		{/if}
		{#if inv}
			<div class="flex justify-end px-4 pb-2">
				<button class="btn btn-secondary h-9 px-3 text-sm" onclick={() => (manualOpen = !manualOpen)} aria-expanded={manualOpen}><Icon name="keyboard" size={18} />{m.scan_type_code()}</button>
			</div>
		{/if}
		{#if manualOpen && !assignTo}
			<form class="flex gap-2 px-4 pb-3" onsubmit={submitManual}>
				<!-- svelte-ignore a11y_autofocus -->
				<input class="input h-11 flex-1 font-mono tracking-wider" bind:value={manualCode} inputmode="text" autocomplete="off" autocapitalize="characters" placeholder="978… / BOK-…" data-testid="manual-code" enterkeyhint="go" autofocus aria-label={m.scan_manual_label()} />
				<button class="btn btn-primary h-11 px-4" disabled={!manualValid}>{inv ? m.common_ok() : mode === 'add' ? m.scan_mode_add() : mode === 'move' ? m.scan_mode_move() : m.scan_mode_check()}</button>
			</form>
		{/if}

		<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
			{#if assignTo}
				<!-- assign mode: nothing to list -->
			{:else if inv}
				<InventoryPanel {inv} label={invPlace?.label ?? ''} {placeOf} {online} />
			{:else if mode === 'check'}
				{#if verdict}
					<Verdict v={verdict} onadd={addFromVerdict} adding={verdictAdding} />
				{:else}
					<p class="mt-6 text-center text-sm text-muted">{m.scan_check_hint()}</p>
					<p class="mx-auto mt-2 max-w-xs text-center text-xs text-muted">{m.scan_tip_labels_check()}</p>
				{/if}
			{:else if scans.length}
				<ul class="space-y-2">
					{#each scans as s (s.id)}
						<ScanCard
							scan={s}
							{online}
							onundo={() => undo(s)}
							onanother={() => queue.addAnother(s.id)}
							onskip={() => queue.skip(s.id)}
							onretry={() => queue.retry(s.id)}
							onmovehere={() => queue.moveHere(s.id)}
							{placeOf}
						/>
					{/each}
				</ul>
			{:else}
				<p class="mt-6 text-center text-sm text-muted">{m.scan_empty_hint()}</p>
				<p class="mx-auto mt-2 max-w-xs text-center text-xs text-muted">{m.scan_tip_labels()}</p>
			{/if}
			{#if engine && page.url.searchParams.has('debug')}<p class="mt-4 text-center font-mono text-[10px] text-muted">{engine}</p>{/if}
		</div>
	</div>
</div>

<SectionPicker tree={tree} bind:open={pickerOpen} title={m.scan_pick_target()} current={target} allowUnsorted onpick={setTarget} />
