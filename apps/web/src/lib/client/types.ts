// Mirrors the JSON returned by /api/v1/scans, /check and /library/snapshot (see @bok/server library.ts).
export interface BookSummary {
	editionId: string;
	workId: string;
	title: string;
	authors: string[];
	year: number | null;
	publisher: string | null;
	isbn13: string | null;
	issn: string | null;
	cover: string | null;
}

export interface OwnedCopy {
	id: string;
	state: 'shelved' | 'lent' | 'lost';
	createdAt: string;
	sectionId: string | null;
	lentTo?: string | null;
	dueOn?: string | null;
}

export interface BorrowedSummary {
	from: string;
	dueOn: string | null;
}

export type ScanResult =
	| { status: 'added'; copy: OwnedCopy; book: BookSummary; otherCopies: number; sameWorkOtherEditions: number }
	| { status: 'duplicate'; book: BookSummary; copies: OwnedCopy[] }
	| { status: 'not_found' }
	| { status: 'invalid' };

export type MoveResult =
	| { status: 'moved'; copy: OwnedCopy; book: BookSummary; fromSectionId: string | null }
	| { status: 'already_here'; copy: OwnedCopy; book: BookSummary }
	| { status: 'not_owned'; book: BookSummary }
	| { status: 'not_found' }
	| { status: 'invalid' };

export interface ReadingSummary {
	status: 'want_to_read' | 'reading' | 'stuck' | 'read' | 'dnf' | null;
	timesRead: number;
	lastRating: number | null;
}

export interface CachedReading extends ReadingSummary {
	workId: string;
	isbns: string[];
}

export interface CheckResult {
	status: 'invalid' | 'not_found' | 'found';
	book?: BookSummary;
	copies: OwnedCopy[];
	sameWorkOtherEditions: number;
	reading?: ReadingSummary;
	borrowed?: BorrowedSummary[];
}

export type ScanStatus =
	| 'queued' // saved on the device, not sent yet
	| 'sending'
	| 'added'
	| 'duplicate' // server refused without force; waits for the user
	| 'not_found'
	| 'invalid'
	| 'skipped'
	| 'undo_queued'
	| 'undone'
	| 'moved' // move scan: my copy now stands on the target shelf
	| 'already_here'
	| 'not_owned' // move scan of a book I don't have
	| 'error';

export interface ScanRecord {
	id: string; // UUIDv7, becomes the copy id
	code: string;
	addon: string | null;
	scannedAt: number;
	status: ScanStatus;
	kind?: 'add' | 'move';
	/** Target shelf (null/undefined = Unsorted). */
	sectionId?: string | null;
	fromSectionId?: string | null;
	/** Copy touched by a move scan (for undo). */
	copyId?: string;
	force?: boolean;
	undoRequested?: boolean;
	attempts: number;
	book?: BookSummary;
	duplicateOf?: OwnedCopy[];
	otherCopies?: number;
	sameWorkOtherEditions?: number;
	/** Local guess while offline: this code is already in the cached library. */
	localHint?: 'owned';
	error?: string;
}

export interface CachedEdition extends BookSummary {
	copies: OwnedCopy[];
}

// Storage tree (rooms → bookcases → shelves), mirrors @bok/server StorageTree.
export interface TreeSection {
	id: string;
	col: number;
	row: number;
	x: number;
	y: number;
	w: number;
	h: number;
	label: string;
	count: number;
}
export interface TreeContainer {
	id: string;
	name: string;
	type: string;
	layout: import('@bok/core').Layout;
	sections: TreeSection[];
	count: number;
}
export interface StorageTree {
	householdId: string;
	householdName: string;
	locations: { id: string; name: string; containers: TreeContainer[]; count: number }[];
	unsorted: number;
}
