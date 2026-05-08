/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyValue, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

/**
 * Read the current value of a context key in a type-safe way without binding it.
 *
 * This is the safe alternative to calling `key.bindTo(service).get()` for read-only access.
 *
 * **Why this exists:** `RawContextKey.bindTo()` calls `createKey()` → constructor → `reset()`,
 * which resets the key's value back to its declared default. Callers that read the value
 * *after* binding therefore see the default, not the current value. This trap has bitten us
 * twice (`SwitchCodeViewModeAction`, `ToggleArtifactsExpandedAction`).
 *
 * For long-lived owners (e.g. a service or view that needs to mutate the key on events),
 * the recommended pattern is still to call `key.bindTo(service)` **once in the constructor**
 * and reuse the returned `IContextKey<T>` reference. Use this helper only for the
 * read-then-mutate pattern in short-lived action handlers.
 */
export function readContextKey<T extends ContextKeyValue>(service: IContextKeyService, key: RawContextKey<T>): T | undefined {
	return service.getContextKeyValue<T>(key.key);
}
