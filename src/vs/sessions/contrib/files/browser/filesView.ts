/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewPaneLocationColors } from '../../../../workbench/browser/parts/views/viewPane.js';
import { agentsPanelBackground } from '../../../common/theme.js';
import { ExplorerView } from '../../../../workbench/contrib/files/browser/views/explorerView.js';

export const SESSIONS_FILES_VIEW_ID = 'sessions.files.explorer';

export class SessionsExplorerView extends ExplorerView {
	protected override getLocationBasedColors(): IViewPaneLocationColors {
		const colors = super.getLocationBasedColors();
		return {
			...colors,
			background: agentsPanelBackground,
			listOverrideStyles: {
				...colors.listOverrideStyles,
				listBackground: agentsPanelBackground,
			}
		};
	}

	// Skip the inherited `renderHeader` — when embedded inside the Code view pane
	// we hide the header (`headerVisible = false`) and the default implementation
	// looks up this view's container in the views registry, which we don't register.
	protected override renderHeader(_container: HTMLElement): void { }

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
	}
}
