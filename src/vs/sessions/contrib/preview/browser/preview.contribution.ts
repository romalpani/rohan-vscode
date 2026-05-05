/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, WindowEnablement } from '../../../../workbench/common/views.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { SESSIONS_PREVIEW_VIEW_ID, SessionsPreviewView } from './previewView.js';
import { IsPhoneLayoutContext } from '../../../common/contextkeys.js';
import { ISessionsPreviewService, SessionsPreviewService } from '../../../services/preview/common/sessionsPreviewService.js';
import { SessionsPreviewBrowserOpener } from './previewBrowserOpener.js';

export const SESSIONS_PREVIEW_CONTAINER_ID = 'workbench.sessions.auxiliaryBar.previewContainer';

const previewViewIcon = registerIcon('sessions-preview-view-icon', Codicon.openPreview, localize2('sessionsPreviewViewIcon', 'View icon for the Preview view in the sessions window.').value);

const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);

const previewViewContainer = viewContainerRegistry.registerViewContainer({
	id: SESSIONS_PREVIEW_CONTAINER_ID,
	title: localize2('preview', "Preview"),
	icon: previewViewIcon,
	order: 1,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SESSIONS_PREVIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: SESSIONS_PREVIEW_CONTAINER_ID,
	hideIfEmpty: false,
	windowEnablement: WindowEnablement.Sessions,
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true });

const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

viewsRegistry.registerViews([{
	id: SESSIONS_PREVIEW_VIEW_ID,
	name: localize2('preview', "Preview"),
	containerIcon: previewViewIcon,
	ctorDescriptor: new SyncDescriptor(SessionsPreviewView),
	canToggleVisibility: false,
	canMoveView: false,
	when: IsPhoneLayoutContext.negate(),
	windowEnablement: WindowEnablement.Sessions,
}], previewViewContainer);

// Register the preview service
registerSingleton(ISessionsPreviewService, SessionsPreviewService, InstantiationType.Delayed);

// Register the browser opener that routes localhost URLs to the preview pane
registerWorkbenchContribution2(SessionsPreviewBrowserOpener.ID, SessionsPreviewBrowserOpener, WorkbenchPhase.BlockStartup);
