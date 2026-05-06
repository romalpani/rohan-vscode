/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDecision, IDecisionEvidenceFile } from './decisions.js';
import { IRationaleCandidate } from './decisionsMarkdown.js';

/**
 * Match decisions to rationale candidates lifted from the agent's own response
 * (markdown summary preferred, thinking text as fallback). We never invent
 * text — only surface what the agent already wrote.
 *
 * Picking strategy per decision:
 *   1. Find every candidate that mentions one of the decision's evidence files.
 *   2. Among those, prefer:
 *        - higher weight (markdown bullet > markdown sentence > thinking sentence)
 *        - on tie, prefer the shorter (more direct) candidate
 *   3. If nothing mentions any of the decision's files, leave rationale unset.
 */
export function attachRationales(decisions: readonly IDecision[], candidates: readonly IRationaleCandidate[]): IDecision[] {
	if (candidates.length === 0 || decisions.length === 0) {
		return [...decisions];
	}

	return decisions.map(decision => {
		const rationale = pickRationale(decision.evidence, candidates);
		return rationale ? { ...decision, rationale } : decision;
	});
}

function pickRationale(evidence: readonly IDecisionEvidenceFile[], candidates: readonly IRationaleCandidate[]): string | undefined {
	const fileNames = new Set(evidence.map(f => f.fileName.toLowerCase()));
	const baseNames = new Set(
		evidence
			.map(f => baseName(f.fileName).toLowerCase())
			.filter(n => n.length >= 4)
	);

	const matches: IRationaleCandidate[] = [];
	for (const candidate of candidates) {
		if (mentionsAny(candidate.text, fileNames, baseNames)) {
			matches.push(candidate);
		}
	}

	if (matches.length === 0) {
		return undefined;
	}

	matches.sort((a, b) => (b.weight - a.weight) || (a.text.length - b.text.length));
	const picked = matches[0].text;
	return picked.length > 200 ? picked.slice(0, 197).trimEnd() + '…' : picked;
}

function mentionsAny(text: string, fileNames: Set<string>, baseNames: Set<string>): boolean {
	const lower = text.toLowerCase();
	for (const n of fileNames) {
		if (lower.includes(n)) {
			return true;
		}
	}
	for (const n of baseNames) {
		if (lower.includes(n)) {
			return true;
		}
	}
	return false;
}

function baseName(fileName: string): string {
	const dot = fileName.lastIndexOf('.');
	return dot > 0 ? fileName.slice(0, dot) : fileName;
}
