/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { SESSIONS_PREVIEW_VIEW_ID } from '../../../contrib/preview/browser/previewView.js';

export const ISessionsPreviewService = createDecorator<ISessionsPreviewService>('sessionsPreviewService');

export interface ISessionsPreviewService {
	readonly _serviceBrand: undefined;

	/** The currently active browser model in the preview pane, if any. */
	readonly model: IBrowserViewModel | undefined;

	/** Fires when the preview browser model changes (set or cleared). */
	readonly onDidChangeModel: Event<IBrowserViewModel | undefined>;

	/**
	 * Show a URL in the preview pane. Creates or navigates the browser model.
	 * Automatically opens the preview view in the auxiliary bar.
	 */
	show(url: string): Promise<void>;

	/** Hide the preview browser. */
	hide(): void;
}

export class SessionsPreviewService extends Disposable implements ISessionsPreviewService {
	declare readonly _serviceBrand: undefined;

	private _model: IBrowserViewModel | undefined;
	private _input: BrowserEditorInput | undefined;

	private readonly _onDidChangeModel = this._register(new Emitter<IBrowserViewModel | undefined>());
	readonly onDidChangeModel: Event<IBrowserViewModel | undefined> = this._onDidChangeModel.event;

	get model(): IBrowserViewModel | undefined {
		return this._model;
	}

	constructor(
		@IBrowserViewWorkbenchService private readonly _browserViewService: IBrowserViewWorkbenchService,
		@IViewsService private readonly _viewsService: IViewsService,
	) {
		super();
	}

	async show(url: string): Promise<void> {
		// If we already have a model, just navigate to the new URL
		if (this._model) {
			await this._model.loadURL(url);
			this._viewsService.openView(SESSIONS_PREVIEW_VIEW_ID, false);
			return;
		}

		// Create a new browser view through the workbench service
		const id = `preview-${generateUuid()}`;
		this._input = this._browserViewService.getOrCreateLazy(id, { url });

		const model = await this._input.resolve() as IBrowserViewModel;
		this._model = model;

		this._register(model.onWillDispose(() => {
			if (this._model === model) {
				this._model = undefined;
				this._input = undefined;
				this._onDidChangeModel.fire(undefined);
			}
		}));

		this._onDidChangeModel.fire(model);
		this._viewsService.openView(SESSIONS_PREVIEW_VIEW_ID, false);
	}

	hide(): void {
		if (this._model) {
			this._model.setVisible(false);
		}
	}

	override dispose(): void {
		if (this._input) {
			this._input.dispose(true);
			this._input = undefined;
		}
		this._model = undefined;
		super.dispose();
	}
}
