/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../../base/common/hash.js';
import { localize } from '../../../../nls.js';
import { DecisionChangeKind, IDecision, IDecisionEvidenceFile } from './decisions.js';

/**
 * Group evidence files into deterministic decisions.
 *
 * Algorithm (Phase 1 — purely deterministic):
 *  1. Split evidence by `changeKind` (added / modified / deleted).
 *  2. Within each kind-bucket, group files by their longest common directory
 *     prefix at the segment boundary. Files that don't share a prefix with
 *     any peer become their own single-file decision.
 *  3. Each resulting group becomes one decision; titles describe the action
 *     and the most specific shared label.
 *
 * Output is stable: identical input always produces identical decisions
 * (same ids, order, titles).
 */
export function buildDeterministicDecisions(evidence: readonly IDecisionEvidenceFile[]): IDecision[] {
	if (evidence.length === 0) {
		return [];
	}

	const decisions: IDecision[] = [];

	for (const kind of ['added', 'modified', 'deleted'] as const) {
		const filesOfKind = evidence.filter(e => e.changeKind === kind);
		if (filesOfKind.length === 0) {
			continue;
		}
		const groups = groupByDirectory(filesOfKind);
		for (const group of groups) {
			decisions.push(toDecision(kind, group));
		}
	}

	// Stable order: most files first, then by title.
	decisions.sort((a, b) => {
		if (a.evidence.length !== b.evidence.length) {
			return b.evidence.length - a.evidence.length;
		}
		return a.title.localeCompare(b.title);
	});

	return decisions;
}

interface IDirectoryGroup {
	readonly sharedDirectory: string;
	readonly files: readonly IDecisionEvidenceFile[];
}

/**
 * Group files by directory similarity. Files whose directories share a
 * meaningful prefix (at least one full path segment) are grouped together;
 * anything else stands alone.
 */
function groupByDirectory(files: readonly IDecisionEvidenceFile[]): IDirectoryGroup[] {
	if (files.length === 0) {
		return [];
	}
	if (files.length === 1) {
		return [{ sharedDirectory: files[0].directory, files }];
	}

	// Bucket by exact directory first.
	const byDirectory = new Map<string, IDecisionEvidenceFile[]>();
	for (const file of files) {
		const list = byDirectory.get(file.directory);
		if (list) {
			list.push(file);
		} else {
			byDirectory.set(file.directory, [file]);
		}
	}

	// If everything ended up in one directory, that's one group.
	if (byDirectory.size === 1) {
		const [sharedDirectory, groupFiles] = byDirectory.entries().next().value!;
		return [{ sharedDirectory, files: groupFiles }];
	}

	// Otherwise, try to merge directories that share a common ancestor
	// at least one full segment deep.
	const directories = [...byDirectory.keys()];
	const commonPrefix = longestCommonDirPrefix(directories);

	if (commonPrefix && countSegments(commonPrefix) >= 1) {
		// All directories share this ancestor — single grouped decision.
		const merged: IDecisionEvidenceFile[] = [];
		for (const list of byDirectory.values()) {
			merged.push(...list);
		}
		return [{ sharedDirectory: commonPrefix, files: merged }];
	}

	// No single common ancestor; emit each directory as its own group.
	const groups: IDirectoryGroup[] = [];
	for (const [sharedDirectory, groupFiles] of byDirectory) {
		groups.push({ sharedDirectory, files: groupFiles });
	}
	// Sort largest-first for stable downstream order.
	groups.sort((a, b) => b.files.length - a.files.length || a.sharedDirectory.localeCompare(b.sharedDirectory));
	return groups;
}

function countSegments(directory: string): number {
	if (!directory) {
		return 0;
	}
	return directory.split('/').filter(Boolean).length;
}

/**
 * Longest common directory prefix at a path-segment boundary. Returns `''`
 * if there is no meaningful shared prefix.
 */
function longestCommonDirPrefix(directories: readonly string[]): string {
	if (directories.length === 0) {
		return '';
	}
	const splitDirs = directories.map(d => d.split('/').filter(Boolean));
	const minLen = Math.min(...splitDirs.map(s => s.length));
	const shared: string[] = [];
	for (let i = 0; i < minLen; i++) {
		const segment = splitDirs[0][i];
		if (splitDirs.every(s => s[i] === segment)) {
			shared.push(segment);
		} else {
			break;
		}
	}
	return shared.join('/');
}

function toDecision(kind: DecisionChangeKind, group: IDirectoryGroup): IDecision {
	const insertions = group.files.reduce((sum, f) => sum + f.insertions, 0);
	const deletions = group.files.reduce((sum, f) => sum + f.deletions, 0);
	const label = readableLabel(group);

	const isSingleFile = group.files.length === 1;
	const file = group.files[0];

	let title: string;
	if (isSingleFile) {
		switch (kind) {
			case 'added':
				title = localize('decisions.title.add.file', "Added {0}", file.fileName);
				break;
			case 'deleted':
				title = localize('decisions.title.delete.file', "Deleted {0}", file.fileName);
				break;
			default:
				title = localize('decisions.title.update.file', "Updated {0}", file.fileName);
				break;
		}
	} else {
		switch (kind) {
			case 'added':
				title = localize('decisions.title.add.group', "Added {0}", label);
				break;
			case 'deleted':
				title = localize('decisions.title.delete.group', "Deleted {0}", label);
				break;
			default:
				title = localize('decisions.title.update.group', "Updated {0}", label);
				break;
		}
	}

	const subtitle = buildSubtitle(group);

	const signature = `${kind}:${group.sharedDirectory}:${[...group.files].map(f => f.modifiedUri.toString()).sort().join('|')}`;
	const id = `det-${hash(signature).toString(16)}`;

	return {
		id,
		title,
		subtitle,
		source: { kind: 'deterministic', strategy: isSingleFile ? 'single-file' : 'directory-group' },
		evidence: group.files,
		insertions,
		deletions,
	};
}

/**
 * Pick a short, human-friendly label for a grouped decision based on the
 * shared directory. Uses the last 1-2 segments to stay concise.
 */
function readableLabel(group: IDirectoryGroup): string {
	const segments = group.sharedDirectory.split('/').filter(Boolean);
	if (segments.length === 0) {
		// Fall back to the first file's parent directory or just "files".
		return localize('decisions.label.files', "files");
	}
	// Last two segments tend to identify the feature area (e.g. "contrib/preview").
	const tail = segments.slice(-2).join('/');
	return tail;
}

function buildSubtitle(group: IDirectoryGroup): string {
	const directory = group.sharedDirectory || localize('decisions.subtitle.repoRoot', "(repository root)");
	if (group.files.length === 1) {
		return directory;
	}
	const names = group.files.slice(0, 3).map(f => f.fileName);
	const more = group.files.length - names.length;
	if (more > 0) {
		return localize('decisions.subtitle.withMore', "{0} · {1} +{2} more", directory, names.join(', '), more);
	}
	return localize('decisions.subtitle.list', "{0} · {1}", directory, names.join(', '));
}
