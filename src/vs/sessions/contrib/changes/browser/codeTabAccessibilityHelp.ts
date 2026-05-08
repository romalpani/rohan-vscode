/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ActiveAuxiliaryContext } from '../../../../workbench/common/contextkeys.js';
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID, ChangesContextKeys } from '../common/changes.js';
import { ChangesViewPane } from './changesView.js';
import { ToggleArtifactsExpandedAction } from '../../../browser/expandArtifactsAction.js';
import { SET_CODE_VIEW_MODE_COMMAND_ID } from './changesViewActions.js';

export class CodeTabAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 110;
	readonly name = 'sessionsCodeTab';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.and(
		ActiveAuxiliaryContext.isEqualTo(CHANGES_VIEW_CONTAINER_ID),
		ChangesContextKeys.CodeViewMode.notEqualsTo(''),
	);

	getProvider(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);

		const content: string[] = [];
		content.push(localize('codeTab.overview', "You are in the Code panel. The Code panel shows the changes made by the active agent session. Use the mode selector in the toolbar to switch views."));
		content.push(localize('codeTab.modeSwitcher', "- Switch between Changes, All Files, and Decisions modes: {0}.", `<keybinding:${SET_CODE_VIEW_MODE_COMMAND_ID}>`));
		content.push(localize('codeTab.modeChanges', "- Changes mode: Shows the files modified by the agent, with diff stats and per-file actions."));
		content.push(localize('codeTab.modeAllFiles', "- All Files mode: Shows the full file tree for the session workspace."));
		content.push(localize('codeTab.modeDecisions', "- Decisions mode: Shows a semantic summary of the changes grouped by intent."));
		content.push(localize('codeTab.expandToggle', "- Expand or collapse the Code panel: {0}.", `<keybinding:${ToggleArtifactsExpandedAction.ID}>`));
		content.push(localize('codeTab.openInVsCode', "- Open the session workspace in VS Code: {0}.", '<keybinding:chat.openSessionWorktreeInVSCode>'));
		content.push(localize('codeTab.codeReview', "- Run a code review on the current changes: use the Code Review button in the toolbar."));

		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionsCodeTab,
			{ type: AccessibleViewType.Help },
			() => content.join('\n'),
			() => {
				const view = viewsService.getActiveViewWithId<ChangesViewPane>(CHANGES_VIEW_ID);
				view?.focus();
			},
			AccessibilityVerbositySettingId.SessionsCodeTab,
		);
	}
}
