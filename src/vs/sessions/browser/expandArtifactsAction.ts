/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../base/common/codicons.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { registerIcon } from '../../platform/theme/common/iconRegistry.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { IWorkbenchLayoutService, Parts } from '../../workbench/services/layout/browser/layoutService.js';
import { readContextKey } from '../services/contextKey/common/scopedContextKey.js';
import { Menus } from './menus.js';

// Context key tracking whether the artifacts (auxiliary bar) area is currently expanded
// to fill the window by hiding the sidebar and chat bar. Per-window in-memory state.
export const ArtifactsExpandedContext = new RawContextKey<boolean>('sessionsArtifactsExpanded', false, {
	type: 'boolean',
	description: localize('sessionsArtifactsExpanded', "Whether the artifacts area is expanded to take over the window."),
});

const expandIcon = registerIcon('agent-artifacts-expand', Codicon.screenFull, localize('agentArtifactsExpandIcon', "Icon to expand the artifacts area."));
const collapseIcon = registerIcon('agent-artifacts-collapse', Codicon.screenNormal, localize('agentArtifactsCollapseIcon', "Icon to collapse the artifacts area."));

interface ISavedLayout {
	sidebarVisible: boolean;
	chatBarVisible: boolean;
}

// Per-window memory of the layout state captured the last time we expanded.
// We restore the same parts to their prior visibility on collapse.
const savedLayouts = new WeakMap<IWorkbenchLayoutService, ISavedLayout>();

export class ToggleArtifactsExpandedAction extends Action2 {

	static readonly ID = 'workbench.action.agentToggleArtifactsExpanded';

	constructor() {
		super({
			id: ToggleArtifactsExpandedAction.ID,
			title: localize2('toggleArtifactsExpanded', 'Expand Artifacts'),
			icon: expandIcon,
			toggled: {
				condition: ArtifactsExpandedContext,
				icon: collapseIcon,
				title: localize('collapseArtifacts', 'Collapse Artifacts'),
				tooltip: localize('collapseArtifactsTooltip', 'Collapse Artifacts'),
			},
			tooltip: localize('expandArtifactsTooltip', 'Expand Artifacts'),
			f1: true,
			category: localize2('view', 'View'),
			menu: [{
				id: Menus.AuxiliaryBarTitle,
				group: 'navigation',
				order: 100,
			}],
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const contextKeyService = accessor.get(IContextKeyService);
		const telemetryService = accessor.get(ITelemetryService);

		// Read the current value before bindTo (which would reset to default — see readContextKey docs).
		const isExpanded = readContextKey(contextKeyService, ArtifactsExpandedContext) === true;
		const expandedKey: IContextKey<boolean> = ArtifactsExpandedContext.bindTo(contextKeyService);

		if (isExpanded) {
			// Collapse: restore prior visibility for sidebar and chat bar.
			const saved = savedLayouts.get(layoutService);
			if (saved) {
				layoutService.setPartHidden(!saved.sidebarVisible, Parts.SIDEBAR_PART);
				layoutService.setPartHidden(!saved.chatBarVisible, Parts.CHATBAR_PART);
				savedLayouts.delete(layoutService);
			} else {
				// No saved layout (e.g., user toggled context key externally); show both as a sane default.
				layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
				layoutService.setPartHidden(false, Parts.CHATBAR_PART);
			}
			expandedKey.set(false);
			alert(localize('artifactsCollapsed', "Artifacts collapsed"));
		} else {
			// Expand: capture current visibility, then hide sidebar and chat bar.
			savedLayouts.set(layoutService, {
				sidebarVisible: layoutService.isVisible(Parts.SIDEBAR_PART),
				chatBarVisible: layoutService.isVisible(Parts.CHATBAR_PART),
			});
			layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
			layoutService.setPartHidden(true, Parts.CHATBAR_PART);
			// Make sure the auxiliary bar is visible (it should be, since the button lives there).
			layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			expandedKey.set(true);
			alert(localize('artifactsExpanded', "Artifacts expanded"));
		}

		type ArtifactsExpandedEvent = { expanded: boolean };
		type ArtifactsExpandedClassification = {
			expanded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True when expanded, false when collapsed.' };
			owner: 'romalpani';
			comment: 'Tracks usage of the expand-artifacts toggle in the Agents window.';
		};
		telemetryService.publicLog2<ArtifactsExpandedEvent, ArtifactsExpandedClassification>('sessions.artifacts.expanded', {
			expanded: !isExpanded,
		});
	}
}

registerAction2(ToggleArtifactsExpandedAction);
