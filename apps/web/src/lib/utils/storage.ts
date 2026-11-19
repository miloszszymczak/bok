import type { StorageKind } from '@bok/core';
import { m } from '#lib/paraglide/messages.js';

/** UI texts per storage kind (separate messages: Polish needs its own grammar for each). */
export function kindName(k: StorageKind | string) {
	switch (k) {
		case 'nightstand':
			return m.storage_kind_nightstand();
		case 'pile':
			return m.storage_kind_pile();
		case 'box':
			return m.storage_kind_box();
		case 'ereader':
			return m.storage_kind_ereader();
		case 'other':
			return m.storage_kind_other();
		default:
			return m.storage_kind_bookcase();
	}
}

export function kindHint(k: StorageKind) {
	return k === 'nightstand' ? m.storage_hint_nightstand() : k === 'pile' ? m.storage_hint_pile() : k === 'box' ? m.storage_hint_box() : k === 'ereader' ? m.storage_hint_ereader() : m.storage_hint_bookcase();
}

export function kindPlaceholder(k: StorageKind) {
	return k === 'nightstand' ? m.storage_ph_nightstand() : k === 'pile' ? m.storage_ph_pile() : k === 'box' ? m.storage_ph_box() : k === 'ereader' ? m.storage_ph_ereader() : m.shelves_bookcase_placeholder();
}

export function kindCreate(k: StorageKind) {
	return k === 'nightstand' ? m.storage_create_nightstand() : k === 'pile' ? m.storage_create_pile() : k === 'box' ? m.storage_create_box() : k === 'ereader' ? m.storage_create_ereader() : m.shelves_create_bookcase();
}
