import type { Services } from '@bok/server';

declare global {
	namespace App {
		interface Locals {
			svc: Services;
			user?: { id: string; email: string; name: string; emailVerified: boolean };
			sessionToken?: string;
			theme: 'system' | 'light' | 'dark';
		}
		interface Error {
			message: string;
		}
	}
}

export {};
