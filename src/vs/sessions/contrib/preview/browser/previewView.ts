/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/previewView.css';
import * as dom from '../../../../base/browser/dom.js';
import { getZoomFactor } from '../../../../base/browser/browser.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IBrowserViewModel } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { IBrowserViewNavigationEvent } from '../../../../platform/browserView/common/browserView.js';
import { ISessionsPreviewService } from '../../../services/preview/common/sessionsPreviewService.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';

const $ = dom.$;

export const SESSIONS_PREVIEW_VIEW_ID = 'sessions.preview';

export class SessionsPreviewView extends ViewPane {

	private _navBar!: HTMLElement;
	private _backButton!: HTMLElement;
	private _forwardButton!: HTMLElement;
	private _reloadButton!: HTMLElement;
	private _urlDisplay!: HTMLElement;
	private _browserContainer!: HTMLElement;
	private _placeholderScreenshot!: HTMLElement;
	private _welcomeContainer!: HTMLElement;

	private _model: IBrowserViewModel | undefined;
	private _modelDisposables = this._register(new DisposableStore());
	private _paneVisible = false;
	private _screenshotTimeout: ReturnType<typeof setTimeout> | undefined;
	private _window: CodeWindow | undefined;

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
		@ISessionsPreviewService private readonly _previewService: ISessionsPreviewService,
		@ILogService private readonly _logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(this._previewService.onDidChangeModel(model => {
			this._setModel(model);
		}));

		if (this._previewService.model) {
			this._setModel(this._previewService.model);
		}
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const bodyContainer = dom.append(container, $('.preview-browser-body'));
		this._window = dom.getWindow(container) as CodeWindow;

		// --- Navigation bar ---
		this._navBar = dom.append(bodyContainer, $('.preview-browser-navbar'));

		const navButtons = dom.append(this._navBar, $('.preview-browser-nav-buttons'));

		this._backButton = dom.append(navButtons, $('button.preview-browser-nav-btn'));
		this._backButton.title = localize('preview.goBack', "Go Back");
		this._backButton.appendChild(renderIcon(Codicon.arrowLeft));
		this._register(dom.addDisposableListener(this._backButton, dom.EventType.CLICK, () => {
			this._model?.goBack();
		}));

		this._forwardButton = dom.append(navButtons, $('button.preview-browser-nav-btn'));
		this._forwardButton.title = localize('preview.goForward', "Go Forward");
		this._forwardButton.appendChild(renderIcon(Codicon.arrowRight));
		this._register(dom.addDisposableListener(this._forwardButton, dom.EventType.CLICK, () => {
			this._model?.goForward();
		}));

		this._reloadButton = dom.append(navButtons, $('button.preview-browser-nav-btn'));
		this._reloadButton.title = localize('preview.reload', "Reload");
		this._reloadButton.appendChild(renderIcon(Codicon.refresh));
		this._register(dom.addDisposableListener(this._reloadButton, dom.EventType.CLICK, () => {
			this._model?.reload();
		}));

		const urlContainer = dom.append(this._navBar, $('.preview-browser-url-container'));
		this._urlDisplay = dom.append(urlContainer, $('span.preview-browser-url-display'));

		this._navBar.style.display = 'none';

		// --- Browser container ---
		this._browserContainer = dom.append(bodyContainer, $('.preview-browser-container'));
		this._browserContainer.tabIndex = 0;

		this._placeholderScreenshot = dom.append(this._browserContainer, $('.preview-browser-screenshot'));

		// --- Welcome placeholder ---
		this._welcomeContainer = dom.append(bodyContainer, $('.preview-empty-view-body'));
		const welcomeInner = dom.append(this._welcomeContainer, $('.preview-empty-welcome'));
		const welcomeIcon = dom.append(welcomeInner, $('.preview-empty-welcome-icon'));
		welcomeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.deviceMobile));
		const welcomeMessage = dom.append(welcomeInner, $('.preview-empty-welcome-message'));
		welcomeMessage.textContent = localize('previewView.placeholder', "App preview will appear here");

		this._updateVisibility();
	}

	private _setModel(model: IBrowserViewModel | undefined): void {
		this._modelDisposables.clear();
		this._cancelScheduledScreenshot();
		this._model = model;

		if (model) {
			this._modelDisposables.add(model.onDidNavigate((e: IBrowserViewNavigationEvent) => {
				this._updateNavState(e);
			}));
			this._modelDisposables.add(model.onDidChangeVisibility(() => this._doScreenshot()));
			this._modelDisposables.add(model.onWillDispose(() => {
				if (this._model === model) {
					this._model = undefined;
					this._updateVisibility();
				}
			}));

			// Initialize nav state from current model
			this._updateNavState({
				url: model.url,
				title: model.title,
				canGoBack: model.canGoBack,
				canGoForward: model.canGoForward,
				certificateError: undefined,
			});
		}

		this._updateVisibility();
		this._layoutBrowserView();
	}

	private _updateNavState(event: IBrowserViewNavigationEvent): void {
		if (!this._backButton) {
			return;
		}
		this._backButton.classList.toggle('disabled', !event.canGoBack);
		this._forwardButton.classList.toggle('disabled', !event.canGoForward);
		this._urlDisplay.textContent = event.url || '';
		this._urlDisplay.title = event.url || '';
	}

	override setVisible(visible: boolean): void {
		super.setVisible(visible);
		this._paneVisible = visible;
		this._updateVisibility();
		if (visible) {
			this._layoutBrowserView();
		}
	}

	private _updateVisibility(): void {
		if (!this._browserContainer) {
			return;
		}

		const hasUrl = !!this._model?.url;
		this._welcomeContainer.style.display = hasUrl ? 'none' : '';
		this._browserContainer.style.display = hasUrl ? '' : 'none';
		this._navBar.style.display = hasUrl ? '' : 'none';
		this._placeholderScreenshot.style.display = hasUrl ? '' : 'none';

		if (this._model) {
			const shouldShow = this._paneVisible && hasUrl;
			if (shouldShow !== this._model.visible) {
				if (shouldShow) {
					this._model.setVisible(true);
				} else {
					this._doScreenshot();
					this._window!.requestAnimationFrame(() => this._model?.setVisible(false));
				}
			}
		}
	}

	override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._layoutBrowserView();
	}

	private _layoutBrowserView(retries = 2): void {
		if (!this._model || !this._browserContainer || !this._window) {
			return;
		}

		const rect = this._browserContainer.getBoundingClientRect();
		const cornerRadius = this._window.getComputedStyle(this._browserContainer).borderTopLeftRadius ?? '0';

		if ((rect.width === 0 || rect.height === 0) && retries > 0) {
			this._window.requestAnimationFrame(() => this._layoutBrowserView(retries - 1));
			return;
		}

		void this._model.layout({
			windowId: this._window.vscodeWindowId,
			x: rect.left,
			y: rect.top,
			width: rect.width,
			height: rect.height,
			zoomFactor: getZoomFactor(this._window),
			cornerRadius: parseFloat(cornerRadius),
		});
	}

	private _setBackgroundImage(buffer: VSBuffer | undefined): void {
		if (buffer) {
			const dataUrl = `data:image/jpeg;base64,${encodeBase64(buffer)}`;
			this._placeholderScreenshot.style.backgroundImage = `url('${dataUrl}')`;
		} else {
			this._placeholderScreenshot.style.backgroundImage = '';
		}
	}

	private async _doScreenshot(): Promise<void> {
		if (!this._model) {
			return;
		}
		this._cancelScheduledScreenshot();
		if (!this._model.visible) {
			return;
		}
		try {
			const screenshot = await this._model.captureScreenshot({ quality: 80 });
			this._setBackgroundImage(screenshot);
		} catch (error) {
			this._logService.error('Failed to capture browser preview screenshot', error);
		}
		this._screenshotTimeout = setTimeout(() => this._doScreenshot(), 1000);
	}

	private _cancelScheduledScreenshot(): void {
		if (this._screenshotTimeout) {
			clearTimeout(this._screenshotTimeout);
			this._screenshotTimeout = undefined;
		}
	}

	override dispose(): void {
		this._cancelScheduledScreenshot();
		super.dispose();
	}
}
