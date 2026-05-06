/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/decisionsView.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { dirname } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ResourceLabels } from '../../../../workbench/browser/labels.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { createFileIconThemableTreeContainerScope } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IDecision, IDecisionEvidenceFile, IDecisionsService } from '../../../services/decisions/common/decisions.js';

const $ = dom.$;

export const SESSIONS_DECISIONS_VIEW_ID = 'sessions.decisions';

export class SessionsDecisionsView extends ViewPane {

	private _container!: HTMLElement;
	private _list!: HTMLElement;
	private _emptyState!: HTMLElement;

	/** Tracks which decision ids are currently expanded so re-renders preserve state. */
	private readonly _expandedDecisionIds = new Set<string>();

	/**
	 * Disposables created by `_render`. Cleared and re-populated on every render so
	 * stale event listeners and `ResourceLabels` factories never leak.
	 */
	private readonly _renderDisposables = this._register(new DisposableStore());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IDecisionsService private readonly _decisionsService: IDecisionsService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._container = dom.append(container, $('.sessions-decisions-body'));

		// File icon themability for the embedded `ResourceLabel`s — matches the Changes tab.
		this._register(createFileIconThemableTreeContainerScope(this._container, this.themeService));

		this._list = dom.append(this._container, $('.sessions-decisions-list'));

		this._emptyState = dom.append(this._container, $('.sessions-decisions-empty'));
		const emptyIcon = dom.append(this._emptyState, $('.sessions-decisions-empty-icon'));
		emptyIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.lightbulb));
		const emptyMessage = dom.append(this._emptyState, $('.sessions-decisions-empty-message'));
		emptyMessage.textContent = localize('decisions.empty.message', "Decisions will appear here once the agent makes changes.");

		this._register(autorun(reader => {
			const decisions = this._decisionsService.decisions.read(reader);
			this._render(decisions);
		}));
	}

	private _render(decisions: readonly IDecision[]): void {
		// Clear listeners attached during the previous render before clearing the DOM.
		this._renderDisposables.clear();

		// Drop any stale expanded ids whose decisions no longer exist.
		const validIds = new Set(decisions.map(d => d.id));
		for (const id of [...this._expandedDecisionIds]) {
			if (!validIds.has(id)) {
				this._expandedDecisionIds.delete(id);
			}
		}

		const isEmpty = decisions.length === 0;
		this._list.style.display = isEmpty ? 'none' : '';
		this._emptyState.style.display = isEmpty ? '' : 'none';

		dom.clearNode(this._list);
		if (isEmpty) {
			return;
		}

		for (const decision of decisions) {
			this._list.appendChild(this._renderDecision(decision));
		}
	}

	private _renderDecision(decision: IDecision): HTMLElement {
		const row = $('.sessions-decisions-row');
		const isExpanded = this._expandedDecisionIds.has(decision.id);
		row.classList.toggle('expanded', isExpanded);

		// --- Header (clickable to toggle expansion) ---
		const header = dom.append(row, $('button.sessions-decisions-row-header'));
		header.setAttribute('aria-expanded', String(isExpanded));
		header.setAttribute('aria-label', decision.title);
		header.setAttribute('type', 'button');

		const caret = dom.append(header, $('.sessions-decisions-row-caret'));
		caret.appendChild(renderIcon(isExpanded ? Codicon.chevronDown : Codicon.chevronRight));

		const text = dom.append(header, $('.sessions-decisions-row-text'));
		const title = dom.append(text, $('.sessions-decisions-row-title'));
		title.textContent = decision.title;
		if (decision.rationale) {
			const rationale = dom.append(text, $('.sessions-decisions-row-rationale'));
			rationale.textContent = decision.rationale;
			rationale.title = decision.rationale;
		}
		this._renderStatsSubtext(text, decision);

		this._renderDisposables.add(dom.addDisposableListener(header, dom.EventType.CLICK, () => {
			if (this._expandedDecisionIds.has(decision.id)) {
				this._expandedDecisionIds.delete(decision.id);
			} else {
				this._expandedDecisionIds.add(decision.id);
			}
			this._render(this._decisionsService.decisions.get());
		}));

		// --- Expanded body: list of files rendered the same way as the Changes tab. ---
		if (isExpanded) {
			const body = dom.append(row, $('.sessions-decisions-row-body'));
			const resourceLabels = this._renderDisposables.add(this.instantiationService.createInstance(
				ResourceLabels,
				{ onDidChangeVisibility: this.onDidChangeBodyVisibility }
			));
			for (const file of decision.evidence) {
				body.appendChild(this._renderFile(file, resourceLabels));
			}
		}

		return row;
	}

	private _renderFile(file: IDecisionEvidenceFile, resourceLabels: ResourceLabels): HTMLElement {
		// Use a plain button — `.monaco-list-row` would absolutely-position the row
		// (it's designed for virtualized lists) and stack rows on top of each other.
		const fileRow = $('button.sessions-decisions-file');
		fileRow.setAttribute('type', 'button');

		const labelContainer = dom.append(fileRow, $('.sessions-decisions-file-label'));
		const label = this._renderDisposables.add(resourceLabels.create(labelContainer, { supportHighlights: false, supportDescriptionHighlights: false }));
		label.setResource({
			resource: file.modifiedUri,
			name: file.fileName,
			description: file.directory || undefined,
		}, {
			fileKind: FileKind.FILE,
			fileDecorations: undefined,
			strikethrough: file.changeKind === 'deleted',
		});

		// Decoration badge (A/M/D) — styled to match the Changes tab visually.
		const badge = dom.append(fileRow, $('.sessions-decisions-file-badge'));
		switch (file.changeKind) {
			case 'added':
				badge.textContent = 'A';
				badge.classList.add('added');
				break;
			case 'deleted':
				badge.textContent = 'D';
				badge.classList.add('deleted');
				break;
			default:
				badge.textContent = 'M';
				badge.classList.add('modified');
				break;
		}

		// Line counts (+N -N) — same color tokens as the Changes tab.
		const lineCounts = dom.append(fileRow, $('.sessions-decisions-file-line-counts'));
		const added = dom.append(lineCounts, $('span.sessions-decisions-file-lines-added'));
		added.textContent = `+${file.insertions}`;
		const removed = dom.append(lineCounts, $('span.sessions-decisions-file-lines-removed'));
		removed.textContent = `-${file.deletions}`;

		fileRow.setAttribute('aria-label', localize(
			'decisions.file.aria',
			"{0}, {1}, +{2} -{3}",
			file.fileName,
			file.directory || dirname(file.modifiedUri).path,
			file.insertions,
			file.deletions,
		));

		this._renderDisposables.add(dom.addDisposableListener(fileRow, dom.EventType.CLICK, () => {
			this._openFile(file);
		}));

		return fileRow;
	}

	private _renderStatsSubtext(parent: HTMLElement, decision: IDecision): void {
		const stats = dom.append(parent, $('.sessions-decisions-row-stats'));
		const fileLabel = decision.evidence.length === 1
			? localize('decisions.subtext.file', "1 file")
			: localize('decisions.subtext.files', "{0} files", decision.evidence.length);
		const fileSpan = dom.append(stats, $('span'));
		fileSpan.textContent = `${fileLabel} · `;
		const added = dom.append(stats, $('span.sessions-decisions-row-lines-added'));
		added.textContent = `+${decision.insertions}`;
		dom.append(stats, $('span')).textContent = ' ';
		const removed = dom.append(stats, $('span.sessions-decisions-row-lines-removed'));
		removed.textContent = `-${decision.deletions}`;
	}

	private async _openFile(file: IDecisionEvidenceFile): Promise<void> {
		const options = { pinned: true, preserveFocus: false };
		try {
			if (file.changeKind === 'deleted' && file.originalUri) {
				await this._editorService.openEditor({ resource: file.originalUri, options }, ACTIVE_GROUP);
				return;
			}
			if (file.originalUri) {
				await this._editorService.openEditor({
					original: { resource: file.originalUri },
					modified: { resource: file.modifiedUri },
					options,
				}, ACTIVE_GROUP);
				return;
			}
			await this._editorService.openEditor({ resource: file.modifiedUri, options }, ACTIVE_GROUP);
		} catch {
			// Swallow open failures — they would already surface via the editor service.
		}
	}
}
