/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * One file participating in a decision. Always sourced from the deterministic
 * change manifest — never invented by the agent or model.
 */
export interface IDecisionEvidenceFile {
	/** Stable index into the per-session manifest. */
	readonly index: number;
	/** Resource shown in the modified side of the diff editor. */
	readonly modifiedUri: URI;
	/** Resource shown in the original side of the diff editor (if any). */
	readonly originalUri: URI | undefined;
	/** Final path segment (e.g. `previewView.ts`). */
	readonly fileName: string;
	/** Directory portion of the path, joined with `/` (e.g. `src/vs/sessions/contrib/preview/browser`). */
	readonly directory: string;
	/** Extension including leading dot (e.g. `.ts`). Empty string if none. */
	readonly extension: string;
	/** What the agent did to the file. */
	readonly changeKind: DecisionChangeKind;
	/** Lines added in this file. */
	readonly insertions: number;
	/** Lines removed from this file. */
	readonly deletions: number;
}

export type DecisionChangeKind = 'added' | 'modified' | 'deleted';

/**
 * Provenance for a decision. Phase 1 only emits `'deterministic'`; later
 * phases add `'agent-ledger'` and `'llm-refined'`.
 */
export type DecisionSource =
	| { readonly kind: 'deterministic'; readonly strategy: string };

/**
 * A single reviewable choice. Phase 1 builds these purely from the
 * deterministic manifest; phases 3-4 enrich with agent intent and LLM polish.
 */
export interface IDecision {
	/** Stable id derived from the grouping signature. */
	readonly id: string;
	/** Imperative one-liner shown as the row title (<= 80 chars). */
	readonly title: string;
	/** One-line context shown under the title (<= 140 chars). */
	readonly subtitle: string;
	/**
	 * Optional one-sentence rationale extracted from the agent's thinking/reasoning
	 * about why this change was made. Undefined when no confident attribution
	 * could be made — never fabricated.
	 */
	readonly rationale?: string;
	/** Where the decision came from. */
	readonly source: DecisionSource;
	/** The files that implement this decision. Always non-empty. */
	readonly evidence: readonly IDecisionEvidenceFile[];
	/** Aggregate lines added across the evidence. */
	readonly insertions: number;
	/** Aggregate lines removed across the evidence. */
	readonly deletions: number;
}

export const IDecisionsService = createDecorator<IDecisionsService>('decisionsService');

/**
 * Service that produces grounded {@link IDecision} objects for the active
 * session. Phase 1 implementation is fully deterministic — no LLM and no
 * agent-ledger ingestion.
 */
export interface IDecisionsService {
	readonly _serviceBrand: undefined;

	/**
	 * Decisions for the active session. Recomputes whenever the active session
	 * or its `changes` observable change.
	 */
	readonly decisions: IObservable<readonly IDecision[]>;
}
