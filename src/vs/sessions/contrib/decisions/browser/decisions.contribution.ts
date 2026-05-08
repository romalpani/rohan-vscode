/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IDecisionsService } from '../../../services/decisions/common/decisions.js';
import { DecisionsService } from '../../../services/decisions/common/decisionsService.js';

// Decisions content is rendered inside the Code view container, gated on
// `CodeViewMode.Decisions`. The view itself is registered next to Changes / Files in
// `changes.contribution.ts`. Only the service singleton and the view icon remain here.

export const decisionsViewIcon = registerIcon(
	'sessions-decisions-view-icon',
	Codicon.lightbulb,
	localize('sessionsDecisionsViewIcon', 'View icon for the Decisions view in the sessions window.'),
);

registerSingleton(IDecisionsService, DecisionsService, InstantiationType.Delayed);

