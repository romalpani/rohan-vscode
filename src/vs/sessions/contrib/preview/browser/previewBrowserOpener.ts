/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IExternalOpener, IOpenerService } from '../../../../platform/opener/common/opener.js';
import { isLocalhostAuthority } from '../../../../platform/url/common/trustedDomains.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISessionsPreviewService } from '../../../services/preview/common/sessionsPreviewService.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';

interface IOpenBrowserOptions {
	url?: string;
	openToSide?: boolean;
	reuseUrlFilter?: string;
}

/**
 * In the Sessions window, intercepts browser opens and routes them to the
 * preview pane in the auxiliary bar instead of opening a new editor tab.
 *
 * Two interception points:
 * 1. Overrides the `workbench.action.browser.open` command (used by simple browser extension)
 * 2. Registers as IExternalOpener (used by IOpenerService for localhost links)
 */
export class SessionsPreviewBrowserOpener extends Disposable implements IWorkbenchContribution, IExternalOpener {

	static readonly ID = 'workbench.contrib.sessionsPreviewBrowserOpener';

	constructor(
		@IOpenerService openerService: IOpenerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ISessionsPreviewService private readonly _previewService: ISessionsPreviewService,
	) {
		super();

		// Intercept IOpenerService external opens (e.g. from chat links)
		this._register(openerService.registerExternalOpener(this));

		// Override the integrated browser command used by simple browser extension
		this._register(CommandsRegistry.registerCommand(BrowserViewCommandId.Open, async (_accessor, urlOrOptions?: string | IOpenBrowserOptions) => {
			const options = typeof urlOrOptions === 'string' ? { url: urlOrOptions } : (urlOrOptions ?? {});
			if (options.url) {
				await this._previewService.show(options.url);
			} else {
				await this._previewService.show('about:blank');
			}
		}));
	}

	async openExternal(href: string, _ctx: { sourceUri: URI; preferredOpenerId?: string }, _token: CancellationToken): Promise<boolean> {
		if (!this._configurationService.getValue<boolean>('workbench.browser.openLocalhostLinks')) {
			return false;
		}

		try {
			const parsed = new URL(href);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				return false;
			}
			if (!isLocalhostAuthority(parsed.host)) {
				return false;
			}
		} catch {
			return false;
		}

		await this._previewService.show(href);
		return true;
	}
}
