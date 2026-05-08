/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ChangesContextKeys, CodeViewMode, CHANGES_VIEW_ID } from '../../changes/common/changes.js';
import { ChangesViewPane } from '../../changes/browser/changesView.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.files.action.collapseExplorerFolders',
			title: localize2('collapseExplorerFolders', "Collapse Folders in Explorer"),
			icon: Codicon.collapseAll,
			menu: {
				id: MenuId.ChatEditingSessionCodeOverflow,
				group: '1_viewmode',
				order: 10,
				when: ChangesContextKeys.CodeViewMode.isEqualTo(CodeViewMode.AllFiles),
			},
		});
	}

	run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId(CHANGES_VIEW_ID);
		if (view instanceof ChangesViewPane) {
			view.collapseAllFiles();
		}
	}
});
