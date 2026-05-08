/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IViewContainersRegistry, ViewContainerLocation, IViewsRegistry, Extensions as ViewContainerExtensions, WindowEnablement } from '../../../../workbench/common/views.js';
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID } from '../common/changes.js';
import { ChangesViewPane, ChangesViewPaneContainer } from './changesView.js';
import { ChangesTitleBarContribution } from './changesTitleBarWidget.js';
import { IsPhoneLayoutContext } from '../../../common/contextkeys.js';
import './changesViewActions.js';
import './checksActions.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { CodeTabAccessibilityHelp } from './codeTabAccessibilityHelp.js';

const codeViewIcon = registerIcon('code-view-icon', Codicon.code, localize2('codeViewIcon', 'View icon for the Code view.').value);

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);

const changesViewContainer = viewContainersRegistry.registerViewContainer({
	id: CHANGES_VIEW_CONTAINER_ID,
	title: localize2('code', 'Code'),
	icon: codeViewIcon,
	order: 10,
	ctorDescriptor: new SyncDescriptor(ChangesViewPaneContainer),
	storageId: CHANGES_VIEW_CONTAINER_ID,
	hideIfEmpty: false,
	openCommandActionDescriptor: {
		id: CHANGES_VIEW_CONTAINER_ID,
		mnemonicTitle: localize({ key: 'miCode', comment: ['&& denotes a mnemonic'] }, "Co&&de"),
		keybindings: {
			primary: 0,
			win: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG },
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG },
			mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyG },
		},
		order: 1,
	},
	windowEnablement: WindowEnablement.Sessions
}, ViewContainerLocation.AuxiliaryBar);

const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

viewsRegistry.registerViews([{
	id: CHANGES_VIEW_ID,
	name: localize2('changes', 'Changes'),
	containerIcon: codeViewIcon,
	ctorDescriptor: new SyncDescriptor(ChangesViewPane),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 1,
	when: IsPhoneLayoutContext.negate(),
	windowEnablement: WindowEnablement.Sessions,
}], changesViewContainer);

registerWorkbenchContribution2(ChangesTitleBarContribution.ID, ChangesTitleBarContribution, WorkbenchPhase.AfterRestored);

AccessibleViewRegistry.register(new CodeTabAccessibilityHelp());
