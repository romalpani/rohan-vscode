/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuRegistry, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuMenuDelegate, IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionsTitleBarWidget } from '../../browser/sessionsTitleBarWidget.js';
import { Menus } from '../../../../browser/menus.js';
import { RENAME_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import '../../browser/views/sessionsViewActions.js';

suite('SessionsTitleBarWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('title menu owns the created-session actions', () => {
		const items = MenuRegistry.getMenuItems(Menus.TitleBarSessionActions);
		const commandIds = items.filter(isIMenuItem).map(item => item.command.id).sort();
		const submenuIds = items.filter(isISubmenuItem).map(item => item.submenu.id).sort();

		assert.deepStrictEqual({
			commandIds: commandIds.filter(id => [
				RENAME_SESSION_COMMAND_ID,
				'sessions.chatCompositeBar.addChat',
				'sessions.chatCompositeBar.close',
				'sessions.chatCompositeBar.toggleMaximize',
				'sessions.chatCompositeBar.togglePin',
				'sessionsViewPane.markRead',
				'sessionsViewPane.markUnread',
				'sessionsViewPane.unarchiveSession',
			].includes(id)),
			submenuIds,
		}, {
			commandIds: [
				RENAME_SESSION_COMMAND_ID,
				'sessions.chatCompositeBar.addChat',
				'sessions.chatCompositeBar.close',
				'sessions.chatCompositeBar.toggleMaximize',
				'sessions.chatCompositeBar.togglePin',
				'sessionsViewPane.markRead',
				'sessionsViewPane.markUnread',
			].sort(),
			submenuIds: [Menus.SessionConversations.id],
		});
	});

	test('renders interactive session identity', () => {
		const workspace = new class extends mock<ISessionWorkspace>() {
			override readonly label = 'vscode';
		}();
		const session = new class extends mock<IActiveSession>() {
			override readonly icon = Codicon.copilot;
			override readonly title = constObservable('Fix authentication redirect loop');
			override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(workspace);
			override readonly isQuickChat = constObservable(false);
			override readonly isCreated = constObservable(true);
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession: IObservable<IActiveSession | undefined> = constObservable(session);
		}();
		const action = new class extends mock<SubmenuItemAction>() {
			override readonly id = 'workbench.agentSessions.titlebar';
			override readonly label = 'Agent Sessions';
			override readonly tooltip = '';
			override readonly enabled = true;
			override async run(): Promise<void> { }
		}();
		const container = document.createElement('div');
		const shownMenus: IContextMenuMenuDelegate[] = [];
		const contextMenuService = new class extends mock<IContextMenuService>() {
			override showContextMenu(options: IContextMenuMenuDelegate): void {
				shownMenus.push(options);
			}
		}();
		const widget = store.add(new SessionsTitleBarWidget(action, undefined, sessionsService, contextMenuService));
		widget.render(container);
		container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')?.click();
		container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		container.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));

		assert.deepStrictEqual({
			title: container.querySelector('.agent-sessions-titlebar-title')?.textContent,
			workspace: container.querySelector('.agent-sessions-titlebar-workspace')?.textContent,
			role: container.getAttribute('role'),
			ariaLabel: container.getAttribute('aria-label'),
			ariaHasPopup: container.getAttribute('aria-haspopup'),
			tabIndex: container.tabIndex,
			menuId: shownMenus[0]?.menuId,
			menuArg: shownMenus[0]?.menuActionOptions?.arg,
			menuOpenCount: shownMenus.length,
		}, {
			title: 'Fix authentication redirect loop',
			workspace: 'vscode',
			role: 'button',
			ariaLabel: 'Fix authentication redirect loop, vscode, Show Session Actions',
			ariaHasPopup: 'menu',
			tabIndex: 0,
			menuId: Menus.TitleBarSessionActions,
			menuArg: session,
			menuOpenCount: 3,
		});
	});

	test('renders new session identity for a draft', () => {
		const session = new class extends mock<IActiveSession>() {
			override readonly icon = Codicon.copilot;
			override readonly title = constObservable('');
			override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(undefined);
			override readonly isQuickChat = constObservable(false);
			override readonly isCreated = constObservable(false);
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession: IObservable<IActiveSession | undefined> = constObservable(session);
		}();
		const action = new class extends mock<SubmenuItemAction>() {
			override readonly id = 'workbench.agentSessions.titlebar';
			override readonly label = 'Agent Sessions';
			override readonly tooltip = '';
			override readonly enabled = true;
			override async run(): Promise<void> { }
		}();
		const container = document.createElement('div');
		let menuShown = false;
		const contextMenuService = new class extends mock<IContextMenuService>() {
			override showContextMenu(): void {
				menuShown = true;
			}
		}();
		const widget = store.add(new SessionsTitleBarWidget(action, undefined, sessionsService, contextMenuService));
		widget.render(container);
		container.querySelector<HTMLElement>('.agent-sessions-titlebar-pill')?.click();

		assert.deepStrictEqual({
			title: container.querySelector('.agent-sessions-titlebar-title')?.textContent,
			role: container.getAttribute('role'),
			tabIndex: container.tabIndex,
			menuShown,
		}, {
			title: 'New session',
			role: null,
			tabIndex: -1,
			menuShown: false,
		});
	});
});
