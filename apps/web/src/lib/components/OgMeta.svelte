<script lang="ts">
	/** Open Graph + Twitter card tags (Messenger, WhatsApp, iMessage, Slack, Discord read these). */
	let {
		title,
		description = '',
		image,
		url,
		type = 'website',
		noindex = false
	}: { title: string; description?: string; image: string; url: string; type?: string; noindex?: boolean } = $props();
	const desc = $derived(description.replace(/\s+/g, ' ').trim().slice(0, 200));
</script>

<svelte:head>
	<meta property="og:site_name" content="bok" />
	<meta property="og:type" content={type} />
	<meta property="og:title" content={title} />
	{#if desc}<meta property="og:description" content={desc} /><meta name="description" content={desc} />{/if}
	<meta property="og:url" content={url} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={title} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	{#if desc}<meta name="twitter:description" content={desc} />{/if}
	<meta name="twitter:image" content={image} />
	<link rel="canonical" href={url} />
	{#if noindex}<meta name="robots" content="noindex" />{/if}
</svelte:head>
