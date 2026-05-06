/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, WindowEnablement } from '../../../../workbench/common/views.js';
import { IsPhoneLayoutContext } from '../../../common/contextkeys.js';
import { IDecisionsService } from '../../../services/decisions/common/decisions.js';
import { DecisionsService } from '../../../services/decisions/common/decisionsService.js';
import { SESSIONS_DECISIONS_VIEW_ID, SessionsDecisionsView } from './decisionsView.js';

export const SESSIONS_DECISIONS_CONTAINER_ID = 'workbench.sessions.auxiliaryBar.decisionsContainer';

const decisionsViewIcon = registerIcon(
	'sessions-decisions-view-icon',
	Codicon.lightbulb,
	localize('sessionsDecisionsViewIcon', 'View icon for the Decisions view in the sessions window.'),
);

const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);

const decisionsViewContainer = viewContainerRegistry.registerViewContainer({
	id: SESSIONS_DECISIONS_CONTAINER_ID,
	title: localize2('decisions', "Decisions"),
	icon: decisionsViewIcon,
	// Sits between Preview (1) and Code (10) so review flow goes high-level → low-level.
	order: 5,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SESSIONS_DECISIONS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: SESSIONS_DECISIONS_CONTAINER_ID,
	hideIfEmpty: false,
	windowEnablement: WindowEnablement.Sessions,
}, ViewContainerLocation.AuxiliaryBar);

const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

viewsRegistry.registerViews([{
	id: SESSIONS_DECISIONS_VIEW_ID,
	name: localize2('decisions', "Decisions"),
	containerIcon: decisionsViewIcon,
	ctorDescriptor: new SyncDescriptor(SessionsDecisionsView),
	canToggleVisibility: false,
	canMoveView: false,
	when: IsPhoneLayoutContext.negate(),
	windowEnablement: WindowEnablement.Sessions,
}], decisionsViewContainer);

registerSingleton(IDecisionsService, DecisionsService, InstantiationType.Delayed);
