import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from '@bok/core';

export const citext = customType<{ data: string }>({ dataType: () => 'citext' });

export const id = () => uuid('id').primaryKey().$defaultFn(() => uuidv7());

export const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
};
