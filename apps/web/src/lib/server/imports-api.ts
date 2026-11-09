import { ImportError } from '@bok/server';
import { error } from '@sveltejs/kit';
import { guard } from './api.ts';

export async function importGuard<T>(fn: () => Promise<T>): Promise<T> {
	return guard(async () => {
		try {
			return await fn();
		} catch (e) {
			if (e instanceof ImportError) error(e.code === 'state' ? 409 : 400, e.code);
			throw e;
		}
	});
}
