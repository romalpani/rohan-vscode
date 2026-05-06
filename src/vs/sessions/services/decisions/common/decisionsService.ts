/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ISessionsManagementService } from '../../sessions/common/sessionsManagement.js';
import { IDecision, IDecisionsService } from './decisions.js';
import { buildDeterministicDecisions } from './decisionsGrouping.js';
import { buildEvidenceManifest } from './decisionsManifest.js';
import { extractMarkdownCandidates, extractThinkingCandidates, IRationaleCandidate } from './decisionsMarkdown.js';
import { attachRationales } from './decisionsRationale.js';

/**
 * Phase 1 implementation of {@link IDecisionsService}.
 *
 * Pipeline:
 *   activeSession.changes → manifest → deterministic decisions
 *                                          ↓
 *                              completed-response candidates → rationales
 *
 * Candidate sources, in priority order (highest weight first):
 *   1. Markdown bullets in the *final* completed response (the agent's own
 *      curated summary — by far the highest-signal description of "why").
 *   2. Markdown sentences in completed responses (prose summaries without
 *      bullet structure).
 *   3. Thinking-text sentences (Claude/o3 extended thinking — coarser, used
 *      while streaming and as a permanent fallback).
 *
 * Pass 1 (deterministic grouping) runs immediately on every change. Pass 2
 * (markdown candidates) only runs once the response is complete, so the
 * summary text is fully present.
 */
export class DecisionsService extends Disposable implements IDecisionsService {
	declare readonly _serviceBrand: undefined;

	readonly decisions: IObservable<readonly IDecision[]>;

	constructor(
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IChatService chatService: IChatService,
	) {
		super();

		this.decisions = derived(reader => {
			const activeSession = sessionsManagementService.activeSession.read(reader);
			if (!activeSession) {
				return [];
			}
			const changes = activeSession.changes.read(reader);
			if (changes.length === 0) {
				return [];
			}
			const workspaceRoot = activeSession.workspace.read(reader)?.repositories[0]?.workingDirectory;
			const manifest = buildEvidenceManifest(changes, workspaceRoot);
			const baseDecisions = buildDeterministicDecisions(manifest);

			const activeChat = activeSession.activeChat.read(reader);
			const chatModel = chatService.getSession(activeChat.resource);
			if (!chatModel) {
				return baseDecisions;
			}
			// Re-run when the chat model changes so rationales follow new content.
			observableSignalFromEvent(this, chatModel.onDidChange).read(reader);

			const candidates = collectRationaleCandidates(chatModel);
			return attachRationales(baseDecisions, candidates);
		});
	}
}

/**
 * Collect rationale candidates from every request's response. Markdown is only
 * harvested from *completed* responses (the agent's curated summary doesn't
 * exist until then). Thinking is harvested from all responses as a streaming
 * fallback so the UI never feels empty mid-flight.
 *
 * Bounded by char budgets per source so a long session can't make this expensive.
 */
function collectRationaleCandidates(model: IChatModel): IRationaleCandidate[] {
	const MAX_MARKDOWN_CHARS = 32_000;
	const MAX_THINKING_CHARS = 32_000;

	const markdownChunks: string[] = [];
	const thinkingChunks: string[] = [];
	let markdownTotal = 0;
	let thinkingTotal = 0;

	for (const request of model.getRequests()) {
		const response = request.response;
		if (!response) {
			continue;
		}
		const includeMarkdown = response.isComplete && markdownTotal < MAX_MARKDOWN_CHARS;
		const includeThinking = thinkingTotal < MAX_THINKING_CHARS;
		if (!includeMarkdown && !includeThinking) {
			continue;
		}

		for (const part of response.entireResponse.value) {
			if (includeMarkdown && part.kind === 'markdownContent') {
				const text = part.content?.value;
				if (text) {
					markdownChunks.push(text);
					markdownTotal += text.length;
				}
			} else if (includeThinking && part.kind === 'thinking' && part.value) {
				const text = Array.isArray(part.value) ? part.value.join(' ') : part.value;
				if (text) {
					thinkingChunks.push(text);
					thinkingTotal += text.length;
				}
			}
		}
	}

	const markdownText = markdownChunks.join('\n\n').slice(0, MAX_MARKDOWN_CHARS);
	const thinkingText = thinkingChunks.join('\n').slice(0, MAX_THINKING_CHARS);

	return [
		...extractMarkdownCandidates(markdownText),
		...extractThinkingCandidates(thinkingText),
	];
}
