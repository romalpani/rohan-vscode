/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Helpers for extracting rationale candidates from the markdown summary the
 * agent produces at the end of a response. Agents very commonly close with a
 * structured summary like:
 *
 *   "Done! Refactored clock.ts from 463 → ~360 lines by:
 *    - Extracting helpers: svgEl(), htmlEl(), createHandLine() …
 *    - Batching DOM appends: Using .append() with multiple args …
 *    - Using .map() for quick-button creation"
 *
 * Bullets parsed out of that summary are far higher-signal "why" snippets
 * than anything we can lift from streaming thinking text. We never invent
 * text — only surface what the agent already wrote.
 */

/**
 * A self-contained natural-language fragment from the agent's response that
 * can be matched against decision evidence to produce a rationale.
 */
export interface IRationaleCandidate {
	/** The cleaned-up text suitable for display. */
	readonly text: string;
	/**
	 * Rough signal level. Bullets from a final-summary list rank highest because
	 * the agent intentionally curated them; freeform sentences rank lower.
	 */
	readonly weight: number;
}

/**
 * Parse markdown summary text into an ordered list of candidates.
 * Bullets are emitted first (highest weight), then sentence-level fragments.
 */
export function extractMarkdownCandidates(markdown: string): IRationaleCandidate[] {
	if (!markdown.trim()) {
		return [];
	}

	const stripped = stripCodeBlocks(markdown);
	const candidates: IRationaleCandidate[] = [];

	for (const bullet of extractBullets(stripped)) {
		const cleaned = cleanFragment(bullet);
		if (isUsableLength(cleaned)) {
			candidates.push({ text: cleaned, weight: 100 });
		}
	}

	// Sentence-level fallback for prose summaries without bullets.
	for (const sentence of splitSentences(stripped)) {
		const cleaned = cleanFragment(sentence);
		if (isUsableLength(cleaned)) {
			candidates.push({ text: cleaned, weight: 50 });
		}
	}

	return candidates;
}

/**
 * Best-effort sentence split for thinking text (no bullet structure assumed).
 * Returned candidates carry a low weight so markdown bullets always win.
 */
export function extractThinkingCandidates(thinking: string): IRationaleCandidate[] {
	if (!thinking.trim()) {
		return [];
	}
	const stripped = stripCodeBlocks(thinking);
	const out: IRationaleCandidate[] = [];
	for (const sentence of splitSentences(stripped)) {
		const cleaned = cleanFragment(sentence);
		if (isUsableLength(cleaned)) {
			out.push({ text: cleaned, weight: 10 });
		}
	}
	return out;
}

function stripCodeBlocks(text: string): string {
	return text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, m => m.slice(1, -1));
}

/**
 * Pull out bullet items (-, *, •, 1.). Each bullet may span multiple lines
 * (continuation lines are indented). We rejoin the continuation onto the
 * bullet so the fragment is self-contained.
 */
function extractBullets(text: string): string[] {
	const lines = text.split(/\r?\n/);
	const bullets: string[] = [];
	let current: string | undefined;

	const bulletStart = /^\s*(?:[-*•]|\d+\.)\s+(.+)$/;
	const indentedContinuation = /^\s{2,}\S/;

	for (const line of lines) {
		const match = bulletStart.exec(line);
		if (match) {
			if (current) {
				bullets.push(current);
			}
			current = match[1].trim();
		} else if (current && indentedContinuation.test(line)) {
			current = `${current} ${line.trim()}`;
		} else if (current && line.trim() === '') {
			// Blank line ends the current bullet group.
			bullets.push(current);
			current = undefined;
		} else if (current) {
			// Non-blank, non-continuation line — terminate current bullet.
			bullets.push(current);
			current = undefined;
		}
	}
	if (current) {
		bullets.push(current);
	}
	return bullets;
}

function splitSentences(text: string): string[] {
	return text
		.split(/(?<=[.!?])\s+(?=[A-Z`'"\[\(])|\n+/)
		.map(s => s.trim())
		.filter(s => s.length > 0);
}

/**
 * Clean a raw markdown bullet/sentence into a plain, past-tense reason fragment:
 *   - Strip markdown emphasis (`**`, `*`, `__`, `_`) — we render as plain text.
 *   - Normalize separators ("X | Y | Z" → "X, Y, Z") so bullets that the agent
 *     wrote with pipe separators don't render with stray vertical bars.
 *   - Strip first-person scaffolding ("I'll", "Let me", "Now,", …).
 *   - Convert leading present-participle verbs ("Extracting helpers …") to
 *     past tense ("Extracted helpers …") so the rationale reads as a record
 *     of what the agent did, not a plan.
 *   - Sentence-case the first letter.
 */
function cleanFragment(raw: string): string {
	let s = raw.trim();
	if (!s) {
		return s;
	}

	// Strip markdown emphasis but preserve the inner text.
	s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
	s = s.replace(/__([^_]+)__/g, '$1');
	s = s.replace(/(^|\s)\*([^*\s][^*]*?)\*(?=\s|$|[.,;:!?])/g, '$1$2');
	s = s.replace(/(^|\s)_([^_\s][^_]*?)_(?=\s|$|[.,;:!?])/g, '$1$2');

	// Normalize separators and whitespace.
	s = s.replace(/\s*\|\s*/g, ', ');
	s = s.replace(/\s+/g, ' ').trim();

	// Strip common first-person scaffolding from thinking-style sentences.
	s = s.replace(/^(I'?ll|I am going to|I'?m going to|Let'?s|Let me|I need to|I should|I will|I'?ve|I)\s+/i, '');
	s = s.replace(/^(now|first|next|then|so|also)[,:\s]+/i, '');

	s = toPastTense(s);

	if (s.length === 0) {
		return s;
	}
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Convert the leading verb of a fragment to past tense for the common patterns
 * agents actually use. Pure heuristics — anything outside the table is left
 * unchanged so we never invent grammar that distorts meaning.
 */
function toPastTense(s: string): string {
	// Map: leading verb form → past tense form. Order matters: longer/more
	// specific keys first so we don't double-rewrite.
	const presentParticiple: Array<readonly [RegExp, string]> = [
		[/^Refactoring\b/i, 'Refactored'],
		[/^Extracting\b/i, 'Extracted'],
		[/^Batching\b/i, 'Batched'],
		[/^Updating\b/i, 'Updated'],
		[/^Adding\b/i, 'Added'],
		[/^Creating\b/i, 'Created'],
		[/^Deleting\b/i, 'Deleted'],
		[/^Removing\b/i, 'Removed'],
		[/^Renaming\b/i, 'Renamed'],
		[/^Replacing\b/i, 'Replaced'],
		[/^Moving\b/i, 'Moved'],
		[/^Splitting\b/i, 'Split'],
		[/^Merging\b/i, 'Merged'],
		[/^Fixing\b/i, 'Fixed'],
		[/^Introducing\b/i, 'Introduced'],
		[/^Inlining\b/i, 'Inlined'],
		[/^Wiring\b/i, 'Wired'],
		[/^Hooking up\b/i, 'Hooked up'],
		[/^Simplifying\b/i, 'Simplified'],
		[/^Cleaning up\b/i, 'Cleaned up'],
		[/^Consolidating\b/i, 'Consolidated'],
		[/^Centralizing\b/i, 'Centralized'],
		[/^Deduplicating\b/i, 'Deduplicated'],
		[/^Implementing\b/i, 'Implemented'],
		[/^Switching\b/i, 'Switched'],
		[/^Migrating\b/i, 'Migrated'],
		[/^Disabling\b/i, 'Disabled'],
		[/^Enabling\b/i, 'Enabled'],
		[/^Exposing\b/i, 'Exposed'],
		[/^Using\b/i, 'Used'],
	];
	const simplePresent: Array<readonly [RegExp, string]> = [
		[/^Refactor\b/i, 'Refactored'],
		[/^Extract\b/i, 'Extracted'],
		[/^Batch\b/i, 'Batched'],
		[/^Update\b/i, 'Updated'],
		[/^Add\b/i, 'Added'],
		[/^Create\b/i, 'Created'],
		[/^Delete\b/i, 'Deleted'],
		[/^Remove\b/i, 'Removed'],
		[/^Rename\b/i, 'Renamed'],
		[/^Replace\b/i, 'Replaced'],
		[/^Move\b/i, 'Moved'],
		[/^Split\b/i, 'Split'],
		[/^Merge\b/i, 'Merged'],
		[/^Fix\b/i, 'Fixed'],
		[/^Introduce\b/i, 'Introduced'],
		[/^Inline\b/i, 'Inlined'],
		[/^Wire\b/i, 'Wired'],
		[/^Simplify\b/i, 'Simplified'],
		[/^Clean up\b/i, 'Cleaned up'],
		[/^Consolidate\b/i, 'Consolidated'],
		[/^Centralize\b/i, 'Centralized'],
		[/^Deduplicate\b/i, 'Deduplicated'],
		[/^Implement\b/i, 'Implemented'],
		[/^Switch\b/i, 'Switched'],
		[/^Migrate\b/i, 'Migrated'],
		[/^Disable\b/i, 'Disabled'],
		[/^Enable\b/i, 'Enabled'],
		[/^Expose\b/i, 'Exposed'],
		[/^Use\b/i, 'Used'],
	];
	for (const [re, replacement] of presentParticiple) {
		if (re.test(s)) {
			return s.replace(re, replacement);
		}
	}
	for (const [re, replacement] of simplePresent) {
		if (re.test(s)) {
			return s.replace(re, replacement);
		}
	}
	return s;
}

function isUsableLength(text: string): boolean {
	return text.length >= 10 && text.length <= 240;
}
