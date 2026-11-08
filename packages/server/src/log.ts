import pino from 'pino';

export const log = pino({
	level: process.env.LOG_LEVEL ?? 'info',
	base: { service: process.env.SERVICE_NAME ?? 'bok' },
	redact: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.token']
});
export type Logger = typeof log;
