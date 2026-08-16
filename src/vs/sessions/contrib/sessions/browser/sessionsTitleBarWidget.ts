/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsTitleBarWidget.css';
import { $, addDisposableGenericMouseDownListener, addDisposableListener, addStandardDisposableListener, EventType, reset } from '../../../../base/browser/dom.js';
import { IKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { combinedDisposable, Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { Menus } from '../../../browser/menus.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { SessionSupportsRenameContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { SHOW_SESSIONS_PICKER_COMMAND_ID } from './sessionsActions.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { getUntitledSessionTitle } from '../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IBlockedSessionsHeaderActionContext } from './blockedSessionsList.js';

const SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID = 'sessions.blockedSessions.showAllSessions';
const IGNORE_ALL_INPUT_NEEDED_COMMAND_ID = 'sessions.blockedSessions.ignoreAllInputNeeded';
const HIDE_BLOCKED_SESSIONS_COMMAND_ID = 'sessions.blockedSessions.hide';
const RENAME_SESSION_IN_TITLE_BAR_COMMAND_ID = 'sessions.renameSessionInTitleBar';

MenuRegistry.appendMenuItem(Menus.TitleBarSessionActions, {
	command: {
		id: RENAME_SESSION_IN_TITLE_BAR_COMMAND_ID,
		title: localize('renameSession', "Rename..."),
	},
	group: '1_session',
	order: 4,
	when: SessionSupportsRenameContext,
});

export function registerBlockedSessionsHeaderActions(): IDisposable {
	return combinedDisposable(
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
			command: {
				id: SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID,
				title: localize('showAllSessions', "Show All Sessions"),
				icon: Codicon.listSelection,
			},
			group: 'navigation',
			order: 1,
		}),
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
			command: {
				id: IGNORE_ALL_INPUT_NEEDED_COMMAND_ID,
				title: localize('ignoreAllInputNeeded', "Ignore All Input Needed"),
				icon: Codicon.bellSlash,
			},
			group: 'navigation',
			order: 2,
		}),
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
			command: {
				id: HIDE_BLOCKED_SESSIONS_COMMAND_ID,
				title: localize('closeBlockedSessions', "Close"),
				icon: Codicon.close,
			},
			group: 'z_close',
			order: 1,
		}),
	);
}

export function registerBlockedSessionsHeaderCommands(): IDisposable {
	return combinedDisposable(
		CommandsRegistry.registerCommand(SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID, (_accessor, context: IBlockedSessionsHeaderActionContext) => context.showAllSessions()),
		CommandsRegistry.registerCommand(IGNORE_ALL_INPUT_NEEDED_COMMAND_ID, (_accessor, context: IBlockedSessionsHeaderActionContext) => context.ignoreAllSessions()),
		CommandsRegistry.registerCommand(HIDE_BLOCKED_SESSIONS_COMMAND_ID, (_accessor, context: IBlockedSessionsHeaderActionContext) => context.close()),
	);
}

/**
 * Renders the active session identity in the Agents window title bar.
 */
export class SessionsTitleBarWidget extends BaseActionViewItem {

	private _container: HTMLElement | undefined;
	private _lastRenderState: string | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _editingDisposables = this._register(new MutableDisposable<DisposableStore>());
	private _titleElement: HTMLElement | undefined;
	private _renameInput: HTMLInputElement | undefined;
	private _editingSession: IActiveSession | undefined;

	constructor(
		action: SubmenuItemAction,
		options: IBaseActionViewItemOptions | undefined,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super(undefined, action, options);
		this._register(autorun(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			activeSession?.title.read(reader);
			activeSession?.workspace.read(reader);
			activeSession?.isQuickChat?.read(reader);
			activeSession?.isCreated.read(reader);
			this._render();
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this._container = container;
		container.classList.add('agent-sessions-titlebar-container');

		this._render();
	}

	override setFocusable(focusable: boolean): void {
		if (this._container) {
			this._container.tabIndex = focusable && this.sessionsService.activeSession.get()?.isCreated.get() ? 0 : -1;
		}
	}

	override onClick(): void {
		this._showSessionActions();
	}

	private _render(): void {
		if (!this._container) {
			return;
		}

		const icon = this._getActiveSessionIcon();
		const sessionTitle = this._getSessionTitle();
		const workspaceLabel = this._getRepositoryLabel();
		const isCreated = this.sessionsService.activeSession.get()?.isCreated.get() ?? false;
		const activeSession = this.sessionsService.activeSession.get();
		if (this._renameInput) {
			if (activeSession === this._editingSession) {
				return;
			}
			this._endTitleEditing();
		}
		const renderState = `${icon?.id ?? ''}|${sessionTitle}|${workspaceLabel ?? ''}|${isCreated}`;
		if (this._lastRenderState === renderState) {
			return;
		}
		this._lastRenderState = renderState;

		reset(this._container);
		this._titleElement = undefined;
		this._renderDisposables.clear();
		const session = this.sessionsService.activeSession.get();
		const isInteractive = !!session && isCreated;
		this._container.classList.toggle('interactive', isInteractive);
		this._container.classList.toggle('static', !isInteractive);
		if (isInteractive) {
			this._container.setAttribute('role', 'button');
			this._container.setAttribute('aria-haspopup', 'menu');
			this._container.setAttribute('aria-label', workspaceLabel
				? localize('showSessionActionsWithWorkspace', "{0}, {1}, Show Session Actions", sessionTitle, workspaceLabel)
				: localize('showSessionActionsForSession', "{0}, Show Session Actions", sessionTitle));
			this._container.tabIndex = 0;
		} else {
			this._container.removeAttribute('role');
			this._container.removeAttribute('aria-haspopup');
			this._container.removeAttribute('aria-label');
			this._container.tabIndex = -1;
		}
		this._renderActiveSession();
		if (isInteractive) {
			this._renderDisposables.add(addDisposableListener(this._container, EventType.KEY_DOWN, event => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					event.stopPropagation();
					this._showSessionActions();
				}
			}));
		}
	}

	/**
	 * Render the active-session identity: icon + title + workspace.
	 */
	private _renderActiveSession(): void {
		const container = this._container!;

		const icon = this._getActiveSessionIcon();
		const sessionTitle = this._getSessionTitle();
		const workspaceLabel = this._getRepositoryLabel();

		// Session pill: icon + title + workspace together
		const sessionPill = $('div.agent-sessions-titlebar-pill');
		if (this.sessionsService.activeSession.get()?.isCreated.get()) {
			this._renderDisposables.add(addDisposableGenericMouseDownListener(sessionPill, event => {
				event.preventDefault();
				event.stopPropagation();
			}));
			this._renderDisposables.add(addDisposableListener(sessionPill, EventType.CLICK, event => {
				event.preventDefault();
				event.stopPropagation();
				this._showSessionActions();
			}));
		}

		// Center group: icon + title + workspace name
		const centerGroup = $('div.agent-sessions-titlebar-center');

		// Kind icon at the beginning
		if (icon) {
			const iconEl = $('div.agent-sessions-titlebar-icon' + ThemeIcon.asCSSSelector(icon));
			centerGroup.appendChild(iconEl);
		}

		// Session title shown next to the icon
		if (sessionTitle) {
			this._titleElement = $('div.agent-sessions-titlebar-title');
			this._titleElement.textContent = sessionTitle;
			centerGroup.appendChild(this._titleElement);
		}

		// Workspace name shown after the session title
		if (workspaceLabel) {
			const separatorEl = $('div.agent-sessions-titlebar-separator');
			centerGroup.appendChild(separatorEl);

			const workspaceEl = $('div.agent-sessions-titlebar-workspace');
			workspaceEl.textContent = workspaceLabel;
			centerGroup.appendChild(workspaceEl);
		}

		sessionPill.appendChild(centerGroup);

		container.appendChild(sessionPill);
	}

	startTitleEditing(): void {
		const session = this.sessionsService.activeSession.get();
		if (!session?.capabilities.get().supportsRename || this._renameInput || !this._titleElement) {
			return;
		}

		const initialTitle = session.title.get();
		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'agent-sessions-titlebar-title-input';
		input.value = initialTitle;
		input.placeholder = getUntitledSessionTitle(session.isQuickChat?.get() ?? false);
		input.setAttribute('aria-label', localize('renameSession.aria', "Rename session"));
		input.spellcheck = false;

		this._titleElement.style.display = 'none';
		this._titleElement.insertAdjacentElement('afterend', input);
		this._container?.classList.add('editing');
		this._container?.removeAttribute('role');
		this._container?.removeAttribute('aria-haspopup');
		this._container?.removeAttribute('aria-label');
		if (this._container) {
			this._container.tabIndex = -1;
		}
		this._renameInput = input;
		this._editingSession = session;

		input.focus();
		input.select();

		const store = new DisposableStore();
		this._editingDisposables.value = store;
		let finished = false;
		const finish = (commit: boolean) => {
			if (finished) {
				return;
			}
			finished = true;
			const newTitle = input.value.trim();
			this._endTitleEditing();
			if (commit && newTitle && newTitle !== initialTitle.trim()) {
				this.sessionsManagementService.renameSession(session, newTitle).catch(onUnexpectedError);
			}
		};

		store.add(addStandardDisposableListener(input, EventType.KEY_DOWN, (event: IKeyboardEvent) => {
			if (event.equals(KeyCode.Enter)) {
				event.preventDefault();
				event.stopPropagation();
				finish(true);
			} else if (event.equals(KeyCode.Escape)) {
				event.preventDefault();
				event.stopPropagation();
				finish(false);
			} else {
				event.stopPropagation();
			}
		}));
		store.add(addDisposableListener(input, EventType.BLUR, () => finish(false)));
		store.add(addDisposableGenericMouseDownListener(input, event => event.stopPropagation()));
		store.add(addDisposableListener(input, EventType.CLICK, event => event.stopPropagation()));
	}

	private _endTitleEditing(): void {
		this._renameInput?.remove();
		this._renameInput = undefined;
		this._editingSession = undefined;
		this._editingDisposables.clear();
		this._lastRenderState = undefined;
		this._container?.classList.remove('editing');
		this._render();
	}

	/**
	 * Get the icon for the active session's type.
	 */
	private _getActiveSessionIcon(): ThemeIcon | undefined {
		const sessionData = this.sessionsService.activeSession.get();
		if (sessionData) {
			return sessionData.icon;
		}
		return undefined;
	}

	/**
	 * Get the display title for the active session.
	 */
	private _getSessionTitle(): string | undefined {
		const sessionData = this.sessionsService.activeSession.get();
		if (!sessionData) {
			return undefined;
		}
		if (!sessionData.isCreated.get()) {
			return sessionData.isQuickChat?.get()
				? localize('newChat', "New chat")
				: localize('newSession', "New session");
		}
		return sessionData.title.get()?.trim() || getUntitledSessionTitle(sessionData.isQuickChat?.get() ?? false);
	}

	/**
	 * Get the repository label for the active session.
	 */
	private _getRepositoryLabel(): string | undefined {
		const sessionData = this.sessionsService.activeSession.get();
		if (sessionData) {
			const workspace = sessionData.workspace.get();
			if (workspace) {
				return workspace.label;
			}
		}
		return undefined;
	}

	private _showSessionActions(): void {
		const session = this.sessionsService.activeSession.get();
		if (this._renameInput || !session?.isCreated.get() || !this._container) {
			return;
		}
		this.contextMenuService.showContextMenu({
			menuId: Menus.TitleBarSessionActions,
			menuActionOptions: { shouldForwardArgs: true, arg: session },
			getAnchor: () => this._container!,
		});
	}

}

/**
 * Provides custom rendering for the sessions title bar widget
 * in the command center. Uses IActionViewItemService to render a custom widget
 * for the TitleBarControlMenu submenu.
 */
export class SessionsTitleBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentSessionsTitleBar';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		let titleBarWidget: SessionsTitleBarWidget | undefined;

		this._register(CommandsRegistry.registerCommand(RENAME_SESSION_IN_TITLE_BAR_COMMAND_ID, () => titleBarWidget?.startTitleEditing()));

		// Register the submenu item in the Agent Sessions command center
		this._register(MenuRegistry.appendMenuItem(Menus.CommandCenter, {
			submenu: Menus.TitleBarSessionTitle,
			title: localize('agentSessionsControl', "Agent Sessions"),
			order: 101,
			when: ContextKeyExpr.and(IsAuxiliaryWindowContext.negate(), SessionsWelcomeVisibleContext.negate())
		}));

		// Register a placeholder action so the submenu appears
		this._register(MenuRegistry.appendMenuItem(Menus.TitleBarSessionTitle, {
			command: {
				id: SHOW_SESSIONS_PICKER_COMMAND_ID,
				title: localize('showSessions', "Show Sessions"),
			},
			group: 'a_sessions',
			order: 1,
			when: IsAuxiliaryWindowContext.negate()
		}));

		this._register(actionViewItemService.register(Menus.CommandCenter, Menus.TitleBarSessionTitle, (action, options) => {
			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}
			return titleBarWidget = instantiationService.createInstance(SessionsTitleBarWidget, action, options);
		}, undefined));
	}
}
