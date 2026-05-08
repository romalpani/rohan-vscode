/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { readContextKey } from '../../common/scopedContextKey.js';

suite('Sessions - readContextKey', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns undefined when key has never been bound', () => {
		const service = new MockContextKeyService();
		const key = new RawContextKey<string>('test.never-bound', 'default-value');

		// `getContextKeyValue` returns `undefined` for keys that have never been registered
		// in the service — `readContextKey` is a thin wrapper, so it must mirror that.
		assert.strictEqual(readContextKey(service, key), undefined);
	});

	test('returns the most recently set value', () => {
		const service = new MockContextKeyService();
		const key = new RawContextKey<string>('test.read-write', 'default');
		const bound = key.bindTo(service);

		bound.set('hello');
		assert.strictEqual(readContextKey(service, key), 'hello');

		bound.set('world');
		assert.strictEqual(readContextKey(service, key), 'world');
	});

	test('rebinding via bindTo() resets the value to default — locks in the upstream behavior we work around', () => {
		const service = new MockContextKeyService();
		const key = new RawContextKey<string>('test.rebind-resets', 'initial');

		key.bindTo(service).set('mutated');
		assert.strictEqual(readContextKey(service, key), 'mutated');

		// Re-binding resets the key to its declared default — this is the trap
		// `readContextKey` is documented against. If this assertion ever fails,
		// the upstream behavior changed and we can simplify the helper docs.
		key.bindTo(service);
		assert.strictEqual(readContextKey(service, key), 'initial');
	});

	test('preserves type information for typed values', () => {
		const service = new MockContextKeyService();
		const key = new RawContextKey<number>('test.typed-number', 0);
		key.bindTo(service).set(42);

		const value: number | undefined = readContextKey(service, key);
		assert.strictEqual(value, 42);
	});
});
