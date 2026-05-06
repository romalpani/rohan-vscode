/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { extname, basename, relativePath, dirname } from '../../../../base/common/resources.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionFileChange } from '../../../services/sessions/common/session.js';
import { DecisionChangeKind, IDecisionEvidenceFile } from './decisions.js';

function getModifiedUri(change: ISessionFileChange): URI | undefined {
	if (isIChatSessionFileChange2(change)) {
		return change.modifiedUri ?? change.uri;
	}
	return change.modifiedUri;
}

function getOriginalUri(change: ISessionFileChange): URI | undefined {
	return change.originalUri;
}

function getChangeKind(modifiedUri: URI | undefined, originalUri: URI | undefined): DecisionChangeKind {
	if (!originalUri) {
		return 'added';
	}
	if (!modifiedUri) {
		return 'deleted';
	}
	return 'modified';
}

function dirOf(uri: URI, workspaceRoot: URI | undefined): string {
	const dir = dirname(uri);
	if (workspaceRoot) {
		const rel = relativePath(workspaceRoot, dir);
		if (rel !== undefined) {
			return rel || '.';
		}
	}
	// Fall back to just the last two path segments so absolute paths aren't shown.
	const segments = dir.path.split('/').filter(Boolean);
	return segments.slice(-2).join('/');
}

/**
 * Build the deterministic evidence manifest from raw session changes.
 *
 * - Drops entries with no resolvable URI (these never produce a useful diff).
 * - Normalizes both `IChatSessionFileChange` and `IChatSessionFileChange2` shapes.
 * - Produces stable `index` values matching position in the input order.
 * - Computes workspace-relative `directory` values when `workspaceRoot` is provided.
 */
export function buildEvidenceManifest(changes: readonly ISessionFileChange[], workspaceRoot?: URI): IDecisionEvidenceFile[] {
	const evidence: IDecisionEvidenceFile[] = [];
	for (let i = 0; i < changes.length; i++) {
		const change = changes[i];
		const modifiedUri = getModifiedUri(change);
		const originalUri = getOriginalUri(change);
		// Need at least one URI to have anything reviewable.
		const referenceUri = modifiedUri ?? originalUri;
		if (!referenceUri) {
			continue;
		}

		evidence.push({
			index: i,
			modifiedUri: modifiedUri ?? referenceUri,
			originalUri,
			fileName: basename(referenceUri),
			directory: dirOf(referenceUri, workspaceRoot),
			extension: extname(referenceUri),
			changeKind: getChangeKind(modifiedUri, originalUri),
			insertions: change.insertions,
			deletions: change.deletions,
		});
	}
	return evidence;
}
