/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesView.css';
import '../../decisions/browser/media/decisionsView.css';
import * as dom from '../../../../base/browser/dom.js';
import { Schemas } from '../../../../base/common/network.js';
import { isWeb } from '../../../../base/common/platform.js';
import { renderIcon, renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IObjectTreeElement, ITreeSorter } from '../../../../base/browser/ui/tree/tree.js';
import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { autorun, derived, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { basename, dirname, isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuWorkbenchButtonBar } from '../../../../platform/actions/browser/buttonbar.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { MenuId, Action2, MenuItemAction, registerAction2, IMenuService } from '../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider } from '../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchCompressibleObjectTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { defaultCountBadgeStyles, defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { fillEditorsDragData } from '../../../../workbench/browser/dnd.js';
import { ResourceLabels } from '../../../../workbench/browser/labels.js';
import { ViewPane, IViewPaneOptions, ViewAction } from '../../../../workbench/browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { createFileIconThemableTreeContainerScope, IExplorerViewPaneOptions } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../workbench/services/editor/common/editorService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IMultiDiffEditorOptions } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';
import { ChangesMultiDiffSourceResolver, getChangesMultiDiffSourceUri } from './changesMultiDiffSourceResolver.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { CodeReviewStateKind, getCodeReviewFilesFromSessionChanges, getCodeReviewVersion, ICodeReviewService, PRReviewStateKind } from '../../codeReview/browser/codeReviewService.js';
import { CIStatusWidget } from './checksWidget.js';
import { COPILOT_CLOUD_SESSION_TYPE, GITHUB_REMOTE_FILE_SCHEME, SessionStatus } from '../../../services/sessions/common/session.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { IView, Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../base/common/color.js';
import { PANEL_SECTION_BORDER } from '../../../../workbench/common/theme.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../workbench/common/editor.js';
import { logChangesViewFileSelect, logChangesViewVersionModeChange, logChangesViewViewModeChange } from '../../../common/sessionsTelemetry.js';
import { ChecksViewModel } from './checksViewModel.js';
import { AGENT_HOST_SKILL_BUTTON_UPDATE_PR_ID, isAgentHostSkillButtonId } from '../../agentHost/browser/agentHostSkillButtons.js';
import { ActiveSessionContextKeys, CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID, ChangesContextKeys, ChangesVersionMode, ChangesViewMode, CodeViewMode, IsolationMode } from '../common/changes.js';
import { SET_CODE_VIEW_MODE_COMMAND_ID } from './changesViewActions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IDecision, IDecisionEvidenceFile, IDecisionsService } from '../../../services/decisions/common/decisions.js';
import { SessionsExplorerView, SESSIONS_FILES_VIEW_ID } from '../../files/browser/filesView.js';

import { buildTreeChildren, ChangesTreeElement, ChangesTreeRenderer, IChangesFileItem, IChangesTreeRootInfo, isChangesFileItem, toIChangesFileItem } from './changesViewRenderer.js';
import { ChangesViewModel } from './changesViewModel.js';
import { ResourceTree } from '../../../../base/common/resourceTree.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { compareFileNames, comparePaths } from '../../../../base/common/comparers.js';

const $ = dom.$;

// --- Constants

const RUN_SESSION_CODE_REVIEW_ACTION_ID = 'sessions.codeReview.run';

// --- ButtonBar widget

class ChangesButtonBarWidget extends Disposable {
	constructor(
		container: HTMLElement,
		viewModel: ChangesViewModel,
		@IAgentSessionsService agentSessionsService: IAgentSessionsService,
		@IMenuService menuService: IMenuService,
		@ICodeReviewService codeReviewService: ICodeReviewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService
	) {
		super();

		const outgoingChangesObs = derived(reader => {
			const activeSessionState = viewModel.activeSessionStateObs.read(reader);
			return activeSessionState?.outgoingChanges ?? 0;
		});

		const reviewStateObs = derivedOpts<{ isLoading: boolean; commentCount: number | undefined }>({ equalsFn: structuralEquals }, reader => {
			const sessionResource = viewModel.activeSessionResourceObs.read(reader);
			if (!sessionResource) {
				return { isLoading: false, commentCount: undefined };
			}

			const sessionChanges = viewModel.activeSessionChangesObs.read(reader);
			const prReviewState = codeReviewService.getPRReviewState(sessionResource).read(reader);
			const prReviewCommentCount = prReviewState.kind === PRReviewStateKind.Loaded
				? prReviewState.comments.length
				: 0;

			let isLoading = false;
			let commentCount: number | undefined;
			if (sessionChanges && sessionChanges.length > 0) {
				const reviewFiles = getCodeReviewFilesFromSessionChanges(sessionChanges);
				const reviewVersion = getCodeReviewVersion(reviewFiles);
				const reviewState = codeReviewService.getReviewState(sessionResource).read(reader);

				if (reviewState.kind === CodeReviewStateKind.Loading && reviewState.version === reviewVersion) {
					isLoading = true;
				} else {
					const codeReviewCommentCount = reviewState.kind === CodeReviewStateKind.Result && reviewState.version === reviewVersion
						? reviewState.comments.length
						: 0;
					const totalReviewCommentCount = codeReviewCommentCount + prReviewCommentCount;
					if (totalReviewCommentCount > 0) {
						commentCount = totalReviewCommentCount;
					}
				}
			} else if (prReviewCommentCount > 0) {
				commentCount = prReviewCommentCount;
			}

			return { isLoading, commentCount };
		});

		this._register(autorun(reader => {
			const sessionResource = viewModel.activeSessionResourceObs.read(reader);
			const outgoingChanges = outgoingChangesObs.read(reader);
			const reviewState = reviewStateObs.read(reader);

			reader.store.add(new MenuWorkbenchButtonBar(
				container,
				MenuId.ChatEditingSessionChangesToolbar,
				{
					telemetrySource: 'changesView',
					disableWhileRunning: true,
					menuOptions: sessionResource
						? { args: [sessionResource, agentSessionsService.getSession(sessionResource)?.metadata] }
						: { shouldForwardArgs: true },
					buttonConfigProvider: (action) => this._getButtonConfiguration(action, outgoingChanges, reviewState)
				},
				menuService, contextKeyService, contextMenuService, keybindingService, telemetryService, hoverService
			));
		}));
	}

	private _getButtonConfiguration(action: IAction, outgoingChanges: number, reviewState: { isLoading: boolean; commentCount: number | undefined }): { showIcon: boolean; showLabel: boolean; isSecondary?: boolean; customLabel?: string; customClass?: string } | undefined {
		if (
			action.id === 'github.copilot.sessions.sync' ||
			action.id === 'github.copilot.claude.sessions.sync' ||
			action.id === 'github.copilot.chat.createPullRequestCopilotCLIAgentSession.updatePR' ||
			action.id === AGENT_HOST_SKILL_BUTTON_UPDATE_PR_ID
		) {
			const customLabel = outgoingChanges > 0
				? `${action.label} ${outgoingChanges}↑`
				: action.label;
			return { customLabel, showIcon: true, showLabel: true, isSecondary: false };
		}
		if (action.id === RUN_SESSION_CODE_REVIEW_ACTION_ID) {
			if (reviewState.isLoading) {
				return { showIcon: true, showLabel: true, isSecondary: true, customLabel: '$(loading~spin)', customClass: 'code-review-loading' };
			}
			if (reviewState.commentCount !== undefined) {
				return { showIcon: true, showLabel: true, isSecondary: true, customLabel: String(reviewState.commentCount), customClass: 'code-review-comments' };
			}
			return { showIcon: true, showLabel: false, isSecondary: true };
		}
		if (
			action.id === 'chatEditing.viewAllSessionChanges' ||
			action.id === 'github.copilot.chat.openPullRequestCopilotCLIAgentSession.openPR'
		) {
			return { showIcon: true, showLabel: false, isSecondary: true };
		}
		if (action.id === 'agentFeedbackEditor.action.submitActiveSession') {
			return { showIcon: false, showLabel: true, isSecondary: false };
		}
		if (
			action.id === 'github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR' ||
			action.id === 'github.copilot.chat.mergeCopilotCLIAgentSessionChanges.merge' ||
			action.id === 'github.copilot.chat.checkoutPullRequestReroute' ||
			action.id === 'pr.checkoutFromChat' ||
			action.id === 'github.copilot.sessions.initializeRepository' ||
			action.id === 'github.copilot.sessions.commit' ||
			action.id === 'github.copilot.claude.sessions.initializeRepository' ||
			action.id === 'github.copilot.claude.sessions.commit' ||
			action.id === 'github.copilot.claude.sessions.commitAndSync' ||
			action.id === 'agentSession.markAsDone' ||
			isAgentHostSkillButtonId(action.id)
		) {
			return { showIcon: true, showLabel: true, isSecondary: false };
		}

		// Unknown actions (e.g. extension-contributed): only hide the label when an icon is present.
		if (action instanceof MenuItemAction) {
			const icon = action.item.icon;
			if (icon) {
				// Icon-only button (no forced secondary state so primary/secondary can be inferred).
				return { showIcon: true, showLabel: false };
			}
		}

		// Fall back to default button behavior for actions without an icon.
		return undefined;
	}
}

// --- View Pane

export class ChangesViewPane extends ViewPane {

	private bodyContainer: HTMLElement | undefined;
	private welcomeContainer: HTMLElement | undefined;
	private filesHeaderNode: HTMLElement | undefined;
	private filesCountBadge: HTMLElement | undefined;
	private contentContainer: HTMLElement | undefined;
	private overviewContainer: HTMLElement | undefined;
	private summaryContainer: HTMLElement | undefined;
	private listContainer: HTMLElement | undefined;
	// Actions container is positioned outside the card for this layout experiment
	private actionsContainer: HTMLElement | undefined;

	private changesProgressBar!: ProgressBar;
	private tree: WorkbenchCompressibleObjectTree<ChangesTreeElement> | undefined;
	private ciStatusWidget: CIStatusWidget | undefined;
	private splitView: SplitView | undefined;
	private splitViewContainer: HTMLElement | undefined;

	// Code-tab swappable body sections (Option B): the toolbar (filesHeaderNode) is hoisted
	// to the body container so it stays mounted while the body content swaps between
	// Changes / All Files / Decisions modes.
	private changesBodySection: HTMLElement | undefined;
	private filesBodySection: HTMLElement | undefined;
	private decisionsBodySection: HTMLElement | undefined;

	// Last known body dimensions from layoutBody(); used when laying out lazily-mounted
	// embedded views before the next layoutBody() pass arrives.
	private _lastBodyDimensions: { height: number; width: number } | undefined;

	// Lazily-initialized All Files explorer.
	private _filesView: SessionsExplorerView | undefined;
	// Container that holds either the file explorer or the empty welcome message
	// (depending on whether the workspace has any folders).
	private _filesEmptyState: HTMLElement | undefined;
	// Whether we've already installed the workspace-folders listener (one-time setup).
	private _filesSectionListenerInstalled = false;

	// Decisions section state.
	private _decisionsList: HTMLElement | undefined;
	private _decisionsEmptyState: HTMLElement | undefined;
	private readonly _decisionsExpandedIds = new Set<string>();
	private readonly _decisionsRenderDisposables = this._register(new DisposableStore());

	private readonly isMergeBaseBranchProtectedContextKey: IContextKey<boolean>;
	private readonly isolationModeContextKey: IContextKey<IsolationMode>;
	private readonly hasGitRepositoryContextKey: IContextKey<boolean>;
	private readonly hasUpstreamContextKey: IContextKey<boolean>;
	private readonly hasIncomingChangesContextKey: IContextKey<boolean>;
	private readonly hasOpenPullRequestContextKey: IContextKey<boolean>;
	private readonly hasOutgoingChangesContextKey: IContextKey<boolean>;
	private readonly hasPullRequestContextKey: IContextKey<boolean>;
	private readonly hasGitHubRemoteContextKey: IContextKey<boolean>;
	private readonly hasUncommittedChangesContextKey: IContextKey<boolean>;

	private readonly scopedInstantiationService: IInstantiationService;

	private readonly renderDisposables = this._register(new DisposableStore());

	// Track current body dimensions for list layout
	private currentBodyWidth = 0;

	readonly viewModel: ChangesViewModel;

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
		@IEditorService private readonly editorService: IEditorService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IDecisionsService private readonly decisionsService: IDecisionsService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super({ ...options }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.viewModel = this.instantiationService.createInstance(ChangesViewModel);
		this._register(this.viewModel);

		// Multi-diff editor source resolver
		const changesMultiDiffSourceResolver = this.instantiationService.createInstance(ChangesMultiDiffSourceResolver, this.viewModel);
		this._register(changesMultiDiffSourceResolver);

		// Context keys
		this.isMergeBaseBranchProtectedContextKey = ActiveSessionContextKeys.IsMergeBaseBranchProtected.bindTo(this.scopedContextKeyService);
		this.isolationModeContextKey = ActiveSessionContextKeys.IsolationMode.bindTo(this.scopedContextKeyService);
		this.hasGitRepositoryContextKey = ActiveSessionContextKeys.HasGitRepository.bindTo(this.scopedContextKeyService);
		this.hasUpstreamContextKey = ActiveSessionContextKeys.HasUpstream.bindTo(this.scopedContextKeyService);
		this.hasIncomingChangesContextKey = ActiveSessionContextKeys.HasIncomingChanges.bindTo(this.scopedContextKeyService);
		this.hasOutgoingChangesContextKey = ActiveSessionContextKeys.HasOutgoingChanges.bindTo(this.scopedContextKeyService);
		this.hasUncommittedChangesContextKey = ActiveSessionContextKeys.HasUncommittedChanges.bindTo(this.scopedContextKeyService);
		this.hasGitHubRemoteContextKey = ActiveSessionContextKeys.HasGitHubRemote.bindTo(this.scopedContextKeyService);
		this.hasPullRequestContextKey = ActiveSessionContextKeys.HasPullRequest.bindTo(this.scopedContextKeyService);
		this.hasOpenPullRequestContextKey = ActiveSessionContextKeys.HasOpenPullRequest.bindTo(this.scopedContextKeyService);

		// Version mode
		this._register(bindContextKey(ChangesContextKeys.VersionMode, this.scopedContextKeyService, reader => {
			return this.viewModel.versionModeObs.read(reader);
		}));

		// View mode
		this._register(bindContextKey(ChangesContextKeys.ViewMode, this.scopedContextKeyService, reader => {
			return this.viewModel.viewModeObs.read(reader);
		}));

		// Set chatSessionType on the view's context key service so ViewTitle menu items
		// can use it in their `when` clauses. Update reactively when the active session
		// changes.
		this._register(bindContextKey(ChatContextKeys.agentSessionType, this.scopedContextKeyService, reader => {
			return this.viewModel.activeSessionTypeObs.read(reader) ?? '';
		}));

		const scopedServiceCollection = new ServiceCollection([IContextKeyService, this.scopedContextKeyService]);
		this.scopedInstantiationService = this.instantiationService.createChild(scopedServiceCollection);
		this._register(this.scopedInstantiationService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.bodyContainer = dom.append(container, $('.changes-view-body'));

		// --- Toolbar (always visible across all Code-tab modes) ---
		// Hoisted out of the splitView/contentContainer so that switching modes never
		// destroys it. Hidden when no active session so it doesn't render against an
		// empty state.
		this.filesHeaderNode = dom.append(this.bodyContainer, $('.changes-files-header'));

		const filesHeaderToolbarContainer = dom.append(this.filesHeaderNode, $('.changes-files-header-toolbar'));
		this._register(this.scopedInstantiationService.createInstance(MenuWorkbenchToolBar, filesHeaderToolbarContainer, MenuId.ChatEditingSessionChangesFileHeaderToolbar, {
			menuOptions: { shouldForwardArgs: true },
			actionViewItemProvider: (action) => {
				if (action.id === 'chatEditing.versionsPicker' && action instanceof MenuItemAction) {
					return this.scopedInstantiationService.createInstance(ChangesPickerActionItem, action);
				}
				return undefined;
			},
		}));

		// Inline action buttons (Merge / Mark as Done / Review / Open in VS Code).
		// Populated lazily in `onVisible` once the view model is available.
		this.actionsContainer = dom.append(this.filesHeaderNode, $('.chat-editing-session-actions.inline'));

		// Overflow toolbar (List / Tree view modes).
		const overflowContainer = dom.append(this.filesHeaderNode, $('.changes-files-header-overflow'));
		this._register(this.scopedInstantiationService.createInstance(MenuWorkbenchToolBar, overflowContainer, MenuId.ChatEditingSessionCodeOverflow, {
			menuOptions: { shouldForwardArgs: true },
		}));

		this.filesCountBadge = dom.append(this.filesHeaderNode, $('.changes-files-count'));
		this.filesCountBadge.style.display = 'none';

		// Hide the entire toolbar row when there is no active session.
		this._register(autorun(reader => {
			const hasActiveSession = !!this.sessionManagementService.activeSession.read(reader);
			this.filesHeaderNode!.style.display = hasActiveSession ? '' : 'none';
		}));

		// --- Body sections (one per mode; swap visibility, never unmount) ---
		this.changesBodySection = dom.append(this.bodyContainer, $('.changes-mode-section'));
		this.filesBodySection = dom.append(this.bodyContainer, $('.changes-mode-section'));
		this.decisionsBodySection = dom.append(this.bodyContainer, $('.changes-mode-section'));
		this.filesBodySection.style.display = 'none';
		this.decisionsBodySection.style.display = 'none';

		// SplitView container for the Changes mode (file tree + CI checks).
		this.splitViewContainer = dom.append(this.changesBodySection, $('.changes-splitview-container'));

		// Main container with file icons support (the "card") — top pane
		this.contentContainer = dom.append(this.splitViewContainer, $('.chat-editing-session-container.show-file-icons'));
		this._register(createFileIconThemableTreeContainerScope(this.contentContainer, this.themeService));

		// Toggle class based on whether the file icon theme has file icons
		const updateHasFileIcons = () => {
			this.contentContainer!.classList.toggle('has-file-icons', this.themeService.getFileIconTheme().hasFileIcons);
		};
		updateHasFileIcons();
		this._register(this.themeService.onDidFileIconThemeChange(updateHasFileIcons));

		// Overview section (header with summary only - actions moved outside card)
		this.overviewContainer = dom.append(this.contentContainer, $('.chat-editing-session-overview'));
		this.summaryContainer = dom.append(this.overviewContainer, $('.changes-summary'));

		// Changes card progress bar
		const progressContainer = dom.append(this.contentContainer, $('.changes-progress'));
		this.changesProgressBar = this._register(new ProgressBar(progressContainer, defaultProgressBarStyles));
		this.changesProgressBar.stop().hide();

		// List container
		this.listContainer = dom.append(this.contentContainer, $('.changes-file-list'));

		// Welcome message for empty state (hidden by default, shown when no changes)
		this.welcomeContainer = dom.append(this.contentContainer, $('.changes-welcome'));
		this.welcomeContainer.style.display = 'none';

		const welcomeIcon = dom.append(this.welcomeContainer, $('.changes-welcome-icon'));
		welcomeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
		const welcomeMessage = dom.append(this.welcomeContainer, $('.changes-welcome-message'));
		welcomeMessage.textContent = localize('changesView.noChanges', "Changed files and other session artifacts will appear here.");

		// CI Status widget — bottom pane
		this.ciStatusWidget = this._register(this.instantiationService.createInstance(CIStatusWidget, this.splitViewContainer));

		// Create SplitView
		this.splitView = this._register(new SplitView(this.splitViewContainer, {
			orientation: Orientation.VERTICAL,
			proportionalLayout: false,
		}));

		// Shared constants for pane sizing
		const ciMinHeight = CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.MIN_BODY_HEIGHT;
		const treeMinHeight = 3 * ChangesTreeDelegate.ROW_HEIGHT;

		// Top pane: file tree
		const treePane: IView = {
			element: this.contentContainer,
			minimumSize: treeMinHeight,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: (height) => {
				this.contentContainer!.style.height = `${height}px`;
				this._layoutTreeInPane(height);
			},
		};

		// Bottom pane: CI checks
		const ciElement = this.ciStatusWidget.element;
		const ciWidget = this.ciStatusWidget;
		const ciPane: IView = {
			element: ciElement,
			get minimumSize() { return ciWidget.collapsed ? CIStatusWidget.HEADER_HEIGHT : ciMinHeight; },
			get maximumSize() { return ciWidget.collapsed ? CIStatusWidget.HEADER_HEIGHT : Number.POSITIVE_INFINITY; },
			onDidChange: Event.map(this.ciStatusWidget.onDidChangeHeight, () => undefined),
			layout: (height) => {
				ciElement.style.height = `${height}px`;
				const bodyHeight = Math.max(0, height - CIStatusWidget.HEADER_HEIGHT);
				ciWidget.layout(bodyHeight);
			},
		};

		this.splitView.addView(treePane, Sizing.Distribute, 0, true);
		this.splitView.addView(ciPane, CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.PREFERRED_BODY_HEIGHT, 1, true);

		// Style the sash as a visible separator between sections
		const updateSplitViewStyles = () => {
			const borderColor = this.themeService.getColorTheme().getColor(PANEL_SECTION_BORDER);
			this.splitView!.style({ separatorBorder: borderColor ?? Color.transparent });
		};
		updateSplitViewStyles();
		this._register(this.themeService.onDidColorThemeChange(updateSplitViewStyles));

		// Initially hide CI pane until checks arrive
		this.splitView.setViewVisible(1, false);

		let savedCIPaneHeight = CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.PREFERRED_BODY_HEIGHT;
		this._register(this.ciStatusWidget.onDidToggleCollapsed(collapsed => {
			if (!this.splitView || !this.ciStatusWidget) {
				return;
			}
			if (collapsed) {
				// Save current size before collapsing
				const currentSize = this.splitView.getViewSize(1);
				if (currentSize > CIStatusWidget.HEADER_HEIGHT) {
					savedCIPaneHeight = currentSize;
				}
				this.splitView.resizeView(1, CIStatusWidget.HEADER_HEIGHT);
			} else {
				// Restore saved size on expand
				this.splitView.resizeView(1, savedCIPaneHeight);
			}
			this.layoutSplitView();
		}));

		this._register(this.ciStatusWidget.onDidChangeHeight(() => {
			if (!this.splitView || !this.ciStatusWidget) {
				return;
			}
			const visible = this.ciStatusWidget.visible;
			const isCurrentlyVisible = this.splitView.isViewVisible(1);
			if (visible !== isCurrentlyVisible) {
				this.splitView.setViewVisible(1, visible);
			}
			this.layoutSplitView();
		}));

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				this.onVisible();
			} else {
				this.renderDisposables.clear();
			}
		}));

		// --- Code-tab mode swapping ---
		// React to changes in the global `CodeViewMode` context key by toggling which
		// body section is visible. The toolbar (filesHeaderNode) stays mounted across
		// all modes.
		const codeViewModeKey = ChangesContextKeys.CodeViewMode.key;
		const modeKeySet: ReadonlySet<string> = new Set([codeViewModeKey]);
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(modeKeySet)) {
				this._syncViewMode();
			}
		}));
		this._syncViewMode();

		// Trigger initial render if already visible
		if (this.isBodyVisible()) {
			this.onVisible();
		}
	}

	override getActionsContext(): URI | undefined {
		return this.viewModel.activeSessionResourceObs.get();
	}

	private onVisible(): void {
		this.renderDisposables.clear();

		// Title actions
		this.renderDisposables.add(autorun(reader => {
			this.viewModel.activeSessionResourceObs.read(reader);
			this.updateActions();
		}));

		// Loading
		this.renderDisposables.add(autorun(reader => {
			const isLoading = this.viewModel.activeSessionIsLoadingObs.read(reader);
			if (isLoading) {
				this.changesProgressBar.infinite().show(200);
			} else {
				this.changesProgressBar.stop().hide();
			}
		}));

		// Changes
		const changesObs = derived(reader => {
			const changes = this.viewModel.activeSessionChangesObs.read(reader);
			return toIChangesFileItem(changes);
		});

		// Changes statistics
		const topLevelStats = derived(reader => {
			const entries = changesObs.read(reader);

			let added = 0, removed = 0;

			for (const entry of entries) {
				added += entry.linesAdded;
				removed += entry.linesRemoved;
			}

			return { files: entries.length, added, removed };
		});

		// Setup context keys and actions toolbar
		if (this.actionsContainer) {
			dom.clearNode(this.actionsContainer);

			// Bind context keys
			this._bindContextKeys(topLevelStats);

			this.renderDisposables.add(this.scopedInstantiationService.createInstance(
				ChangesButtonBarWidget, this.actionsContainer, this.viewModel));
		}

		const activeSessionStatusObs = derived(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.status.read(reader);
		});

		// Update visibility and file count badge based on entries
		this.renderDisposables.add(autorun(reader => {
			if (this.viewModel.activeSessionIsLoadingObs.read(reader)) {
				return;
			}

			// Hide the actions toolbar for untitled sessions.
			const activeSessionStatus = activeSessionStatusObs.read(reader);
			if (this.actionsContainer) {
				dom.setVisibility(activeSessionStatus !== undefined && activeSessionStatus !== SessionStatus.Untitled, this.actionsContainer);
			}

			const { files } = topLevelStats.read(reader);
			const hasEntries = files > 0;

			// Files header visibility is owned by the renderBody-level autorun that
			// reacts to active-session presence — don't override it here.

			dom.setVisibility(hasEntries, this.listContainer!);
			dom.setVisibility(!hasEntries, this.welcomeContainer!);

			// File-count badge is hidden for now (kept in DOM in case we want to
			// re-enable it later). Update the text but keep `display: none`.
			if (this.filesCountBadge) {
				this.filesCountBadge.textContent = `${files}`;
			}

			this.layoutSplitView();
		}));

		// Update summary text (line counts only, file count is shown in badge)
		if (this.summaryContainer) {
			dom.clearNode(this.summaryContainer);

			const linesAddedSpan = dom.$('.working-set-lines-added');
			const linesRemovedSpan = dom.$('.working-set-lines-removed');

			this.summaryContainer.appendChild(linesAddedSpan);
			this.summaryContainer.appendChild(linesRemovedSpan);

			this.renderDisposables.add(autorun(reader => {
				if (this.viewModel.activeSessionIsLoadingObs.read(reader)) {
					return;
				}

				const { added, removed } = topLevelStats.read(reader);

				linesAddedSpan.textContent = `+${added}`;
				linesRemovedSpan.textContent = `-${removed}`;
			}));
		}

		// Create the tree
		if (!this.tree && this.listContainer) {
			this.tree = this.createChangesTree(this.listContainer, this.onDidChangeBodyVisibility, this._store);
		}

		// Register tree event handlers
		if (this.tree) {
			const tree = this.tree;

			// Re-layout when collapse state changes so the card height adjusts
			this.renderDisposables.add(tree.onDidChangeContentHeight(() => this.layoutSplitView()));

			this.renderDisposables.add(tree.onDidOpen((e) => {
				if (!e.element || !isChangesFileItem(e.element)) {
					return;
				}

				logChangesViewFileSelect(this.telemetryService, e.element.changeType);

				const modalEditorMode = this.configurationService.getValue<string>('workbench.editor.useModal');
				if (modalEditorMode === 'all') {
					const items = changesObs.get();
					this._openFileItem(e.element, items, e.sideBySide, !!e.editorOptions?.preserveFocus, !!e.editorOptions?.pinned, items.length > 1);
					return;
				}

				// Open multi-file diff editor
				void this._openMultiFileDiffEditor(e.element.uri);
			}));
		}

		// Checks
		if (this.ciStatusWidget) {
			const checksViewModel = this.instantiationService.createInstance(ChecksViewModel);
			this.renderDisposables.add(checksViewModel);

			this.renderDisposables.add(this.ciStatusWidget.setInput(checksViewModel));
		}

		// Update tree data with combined entries
		this.renderDisposables.add(autorun(reader => {
			const changes = changesObs.read(reader);
			const viewMode = this.viewModel.viewModeObs.read(reader);
			const isLoading = this.viewModel.activeSessionIsLoadingObs.read(reader);
			// Read session state so this autorun re-runs when git state (e.g. branch name)
			// arrives asynchronously, since the tree root label depends on it.
			this.viewModel.activeSessionStateObs.read(reader);

			if (!this.tree || isLoading) {
				return;
			}

			// Toggle list-mode class to remove tree indentation in list mode
			this.listContainer?.classList.toggle('list-mode', viewMode === ChangesViewMode.List);

			if (viewMode === ChangesViewMode.Tree) {
				// Tree mode: build hierarchical tree from file entries
				const treeRootInfo = this.getTreeRootInfo(changes);
				const treeChildren = buildTreeChildren(changes, treeRootInfo);
				this.tree.setChildren(null, treeChildren);
			} else {
				// List mode: flat list of file items
				const listChildren = changes.map(item => ({
					element: item,
					collapsible: false,
				} satisfies IObjectTreeElement<ChangesTreeElement>));
				this.tree.setChildren(null, listChildren);
			}

			this.layoutSplitView();
		}));
	}

	private _bindContextKeys(topLevelStats: IObservable<{ files: number }>): void {
		// Request in progress (can be updated independently since it only affects action enablement, and not visibility)
		this.renderDisposables.add(bindContextKey(ChatContextKeys.requestInProgress, this.scopedContextKeyService, reader => {
			const activeSessionStatus = this.sessionManagementService.activeSession.read(reader)?.status.read(reader);
			return activeSessionStatus !== SessionStatus.Completed && activeSessionStatus !== SessionStatus.Error;
		}));

		// Has changes (can be updated independently since it only affects action enablement, and not visibility)
		this.renderDisposables.add(bindContextKey(ChatContextKeys.hasAgentSessionChanges, this.scopedContextKeyService, reader => {
			const { files } = topLevelStats.read(reader);
			return files > 0;
		}));

		// Bulk update the context keys
		this.renderDisposables.add(autorun(reader => {
			const state = this.viewModel.activeSessionStateObs.read(reader);
			if (!state) {
				return;
			}

			this.logService.info(`[ChangesViewPane][_bindContextKeys] Context keys: ${JSON.stringify(state)}`);

			this.scopedContextKeyService.bufferChangeEvents(() => {
				this.isolationModeContextKey.set(state.isolationMode);
				this.hasGitRepositoryContextKey.set(state.hasGitRepository);
				this.isMergeBaseBranchProtectedContextKey.set(state.isMergeBaseBranchProtected === true);
				this.hasGitHubRemoteContextKey.set(state.hasGitHubRemote === true);
				this.hasPullRequestContextKey.set(state.hasPullRequest === true);
				this.hasOpenPullRequestContextKey.set(state.hasOpenPullRequest === true);
				this.hasUpstreamContextKey.set(state.upstreamBranchName !== undefined);
				this.hasIncomingChangesContextKey.set(state.incomingChanges !== undefined && state.incomingChanges > 0);
				this.hasOutgoingChangesContextKey.set(state.outgoingChanges !== undefined && state.outgoingChanges > 0);
				this.hasUncommittedChangesContextKey.set(state.uncommittedChanges !== undefined && state.uncommittedChanges > 0);
			});
		}));
	}

	/** Layout the tree within its SplitView pane. */
	private _layoutTreeInPane(paneHeight: number): void {
		if (!this.tree) {
			return;
		}
		// Subtract overview height (the toolbar lives in the body container, not here).
		const overviewHeight = this.overviewContainer?.offsetHeight ?? 0;
		const treeHeight = Math.max(0, paneHeight - overviewHeight);
		this.tree.layout(treeHeight, this.currentBodyWidth);
		this.tree.getHTMLElement().style.height = `${treeHeight}px`;
	}

	/** Layout the SplitView to fill the available space inside `changesBodySection`. */
	private layoutSplitView(): void {
		if (!this.splitView || !this.splitViewContainer || !this.changesBodySection) {
			return;
		}
		// `changesBodySection` is a flex child that already gets the leftover height
		// after the always-visible toolbar — use its measured height directly.
		const availableHeight = this.changesBodySection.clientHeight;
		if (availableHeight <= 0) {
			return;
		}
		this.splitViewContainer.style.height = `${availableHeight}px`;
		this.splitView.layout(availableHeight);
	}

	private getTreeSelection(): IChangesFileItem[] {
		const selection = this.tree?.getSelection() ?? [];
		return selection.filter(item => !!item && isChangesFileItem(item));
	}

	private getTreeRootInfo(items: readonly IChangesFileItem[]): IChangesTreeRootInfo | undefined {
		if (items.length === 0) {
			return undefined;
		}

		// Get the repository details for the session
		// - uri: location of the repository
		// - workingDirectory (optional): location of the worktree
		const activeSession = this.sessionManagementService.activeSession.get();
		const repository = activeSession?.workspace.get()?.repositories[0];
		const workspaceFolderUri = repository?.workingDirectory ?? repository?.uri;
		if (!repository?.uri || !workspaceFolderUri) {
			return undefined;
		}

		let name: string = '';
		let resourceTreeRootUri = workspaceFolderUri;

		if (workspaceFolderUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			// Cloud session
			resourceTreeRootUri = URI.from({ scheme: Schemas.copilotPr, path: '/' });
			const segments = workspaceFolderUri.path.split('/').filter(Boolean);
			name = `${segments.slice(0, 2).join('/')} (${decodeURIComponent(segments[2])})`;
		} else {
			// Local session
			const branchName = this.viewModel.activeSessionStateObs.get()?.branchName;
			name = repository.workingDirectory
				? `${basename(repository.uri)} (${branchName})`
				: basename(repository.uri);
		}

		return {
			root: {
				type: 'root',
				uri: workspaceFolderUri,
				name
			},
			resourceTreeRootUri
		};
	}

	private getSessionDiscardRef(): string {
		const versionMode = this.viewModel.versionModeObs.get();
		const firstCheckpointRef = this.viewModel.activeSessionFirstCheckpointRefObs.get();
		const lastCheckpointRef = this.viewModel.activeSessionLastCheckpointRefObs.get();

		if (versionMode === ChangesVersionMode.UncommittedChanges) {
			return 'HEAD';
		}

		return versionMode === ChangesVersionMode.LastTurn
			? lastCheckpointRef
				? `${lastCheckpointRef}^`
				: ''
			: firstCheckpointRef ?? '';
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.currentBodyWidth = width;
		this._lastBodyDimensions = { height, width };
		this.layoutSplitView();
		this._layoutFilesView();
	}

	// --- Code-tab mode swapping (Option B) ---

	/**
	 * Reads the current `CodeViewMode` from the global context key service and
	 * shows the matching body section while hiding the others. Lazily initializes
	 * the All Files explorer and the Decisions section the first time each is
	 * requested.
	 */
	private _syncViewMode(): void {
		if (!this.changesBodySection || !this.filesBodySection || !this.decisionsBodySection) {
			return;
		}

		const mode = this.contextKeyService.getContextKeyValue<CodeViewMode>(ChangesContextKeys.CodeViewMode.key) ?? CodeViewMode.Changes;

		this.changesBodySection.style.display = mode === CodeViewMode.Changes ? '' : 'none';
		this.filesBodySection.style.display = mode === CodeViewMode.AllFiles ? '' : 'none';
		this.decisionsBodySection.style.display = mode === CodeViewMode.Decisions ? '' : 'none';

		try {
			if (mode === CodeViewMode.AllFiles) {
				this._initFilesSection();
				this._layoutFilesView();
			} else if (mode === CodeViewMode.Decisions) {
				this._initDecisionsSection();
			} else {
				// Changes mode — reflow now that the splitView container is visible again.
				this.layoutSplitView();
			}
		} catch (err) {
			// Don't let a single mode's lazy init blank out the entire Code pane —
			// log and continue so the toolbar and other modes remain usable.
			this.logService.error(`[ChangesViewPane] Failed to initialize Code-tab mode '${mode}'`, err);
		}
	}

	/** Collapse all folders in the embedded file explorer. */
	collapseAllFiles(): void {
		this._filesView?.collapseAll();
	}

	/** Lazily mount a `SessionsExplorerView` inside `filesBodySection`. */
	private _initFilesSection(): void {
		if (!this.filesBodySection) {
			return;
		}

		// One-time setup: react to workspace folder changes so we can swap between
		// the explorer and the empty welcome state when a session populates the workspace.
		if (!this._filesSectionListenerInstalled) {
			this._filesSectionListenerInstalled = true;
			this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
				if (this.filesBodySection?.style.display !== 'none') {
					this._initFilesSection();
					this._layoutFilesView();
				}
			}));
		}

		const hasFolders = this.workspaceContextService.getWorkspace().folders.length > 0;

		if (!hasFolders) {
			// Inline empty welcome state when no workspace folders.
			if (this._filesView) {
				this._filesView.element.style.display = 'none';
			}
			if (!this._filesEmptyState) {
				this._filesEmptyState = dom.append(this.filesBodySection, $('.files-empty-view-body'));
				const welcomeContainer = dom.append(this._filesEmptyState, $('.files-empty-welcome'));
				const welcomeIcon = dom.append(welcomeContainer, $('.files-empty-welcome-icon'));
				welcomeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.files));
				const welcomeMessage = dom.append(welcomeContainer, $('.files-empty-welcome-message'));
				welcomeMessage.textContent = localize('filesView.noFiles', "Folders and files will appear here.");
			}
			this._filesEmptyState.style.display = '';
			return;
		}

		// Workspace has folders — show (or create) the explorer.
		if (this._filesEmptyState) {
			this._filesEmptyState.style.display = 'none';
		}
		if (this._filesView) {
			this._filesView.element.style.display = '';
			return;
		}

		const filesViewOptions: IExplorerViewPaneOptions = {
			id: SESSIONS_FILES_VIEW_ID,
			title: localize('codeTab.allFiles', "All Files"),
			delegate: {
				willOpenElement: () => { /* no-op: embedded explorer */ },
				didOpenElement: () => { /* no-op: embedded explorer */ },
			},
		};
		this._filesView = this._register(this.scopedInstantiationService.createInstance(SessionsExplorerView, filesViewOptions));
		this._filesView.render();
		this._filesView.headerVisible = false;
		this.filesBodySection.appendChild(this._filesView.element);

		// Layout BEFORE setVisible so the tree has a non-zero size when `setTreeInput()`
		// is fired by the body-visibility change. Otherwise the async setInput resolves
		// before any layout pass and the virtualized tree renders empty.
		this._layoutFilesView();
		this._filesView.setVisible(true);
		this._layoutFilesView();
	}

	/** Layout the embedded files explorer to fill `filesBodySection`. */
	private _layoutFilesView(): void {
		if (!this._filesView || !this.filesBodySection || this.filesBodySection.style.display === 'none') {
			return;
		}
		// Use the last known body dimensions from layoutBody(). Reading from the DOM at
		// this point can return 0 — our parent flex container may not have committed
		// layout yet when we lazily mount during a `display:''` transition.
		const dims = this._lastBodyDimensions;
		if (!dims || dims.height <= 0 || dims.width <= 0) {
			return;
		}
		this._filesView.orthogonalSize = dims.width;
		this._filesView.layout(dims.height);
	}

	/**
	 * Lazily build the decisions section DOM and bind it to the decisions service.
	 * This intentionally inlines the rendering logic from `SessionsDecisionsView` so
	 * the Code tab can swap content without ever unmounting the surrounding pane
	 * (which would also unmount the toolbar).
	 */
	private _initDecisionsSection(): void {
		if (this._decisionsList || !this.decisionsBodySection) {
			return;
		}

		const root = dom.append(this.decisionsBodySection, $('.sessions-decisions-body'));
		this._register(createFileIconThemableTreeContainerScope(root, this.themeService));

		this._decisionsList = dom.append(root, $('.sessions-decisions-list'));

		this._decisionsEmptyState = dom.append(root, $('.sessions-decisions-empty'));
		const emptyIcon = dom.append(this._decisionsEmptyState, $('.sessions-decisions-empty-icon'));
		emptyIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.lightbulb));
		const emptyMessage = dom.append(this._decisionsEmptyState, $('.sessions-decisions-empty-message'));
		emptyMessage.textContent = localize('decisions.empty.message', "Decisions will appear here once the agent makes changes.");

		this._register(autorun(reader => {
			const decisions = this.decisionsService.decisions.read(reader);
			this._renderDecisions(decisions);
		}));
	}

	private _renderDecisions(decisions: readonly IDecision[]): void {
		if (!this._decisionsList || !this._decisionsEmptyState) {
			return;
		}
		this._decisionsRenderDisposables.clear();

		// Drop any stale expanded ids whose decisions no longer exist.
		const validIds = new Set(decisions.map(d => d.id));
		for (const id of [...this._decisionsExpandedIds]) {
			if (!validIds.has(id)) {
				this._decisionsExpandedIds.delete(id);
			}
		}

		const isEmpty = decisions.length === 0;
		this._decisionsList.style.display = isEmpty ? 'none' : '';
		this._decisionsEmptyState.style.display = isEmpty ? '' : 'none';

		dom.clearNode(this._decisionsList);
		if (isEmpty) {
			return;
		}

		for (const decision of decisions) {
			this._decisionsList.appendChild(this._renderDecision(decision));
		}
	}

	private _renderDecision(decision: IDecision): HTMLElement {
		const row = $('.sessions-decisions-row');
		const isExpanded = this._decisionsExpandedIds.has(decision.id);
		row.classList.toggle('expanded', isExpanded);

		const header = dom.append(row, $('button.sessions-decisions-row-header'));
		header.setAttribute('aria-expanded', String(isExpanded));
		header.setAttribute('aria-label', decision.title);
		header.setAttribute('type', 'button');

		const caret = dom.append(header, $('.sessions-decisions-row-caret'));
		caret.appendChild(renderIcon(isExpanded ? Codicon.chevronDown : Codicon.chevronRight));

		const text = dom.append(header, $('.sessions-decisions-row-text'));
		const title = dom.append(text, $('.sessions-decisions-row-title'));
		title.textContent = decision.title;
		if (decision.rationale) {
			const rationale = dom.append(text, $('.sessions-decisions-row-rationale'));
			rationale.textContent = decision.rationale;
			rationale.title = decision.rationale;
		}
		this._renderDecisionStats(text, decision);

		this._decisionsRenderDisposables.add(dom.addDisposableListener(header, dom.EventType.CLICK, () => {
			if (this._decisionsExpandedIds.has(decision.id)) {
				this._decisionsExpandedIds.delete(decision.id);
			} else {
				this._decisionsExpandedIds.add(decision.id);
			}
			this._renderDecisions(this.decisionsService.decisions.get());
		}));

		if (isExpanded) {
			const body = dom.append(row, $('.sessions-decisions-row-body'));
			const resourceLabels = this._decisionsRenderDisposables.add(this.instantiationService.createInstance(
				ResourceLabels,
				{ onDidChangeVisibility: this.onDidChangeBodyVisibility }
			));
			for (const file of decision.evidence) {
				body.appendChild(this._renderDecisionFile(file, resourceLabels));
			}
		}

		return row;
	}

	private _renderDecisionFile(file: IDecisionEvidenceFile, resourceLabels: ResourceLabels): HTMLElement {
		const fileRow = $('button.sessions-decisions-file');
		fileRow.setAttribute('type', 'button');

		const labelContainer = dom.append(fileRow, $('.sessions-decisions-file-label'));
		const label = this._decisionsRenderDisposables.add(resourceLabels.create(labelContainer, { supportHighlights: false, supportDescriptionHighlights: false }));
		label.setResource({
			resource: file.modifiedUri,
			name: file.fileName,
			description: file.directory || undefined,
		}, {
			fileKind: FileKind.FILE,
			fileDecorations: undefined,
			strikethrough: file.changeKind === 'deleted',
		});

		const badge = dom.append(fileRow, $('.sessions-decisions-file-badge'));
		switch (file.changeKind) {
			case 'added':
				badge.textContent = 'A';
				badge.classList.add('added');
				break;
			case 'deleted':
				badge.textContent = 'D';
				badge.classList.add('deleted');
				break;
			default:
				badge.textContent = 'M';
				badge.classList.add('modified');
				break;
		}

		const lineCounts = dom.append(fileRow, $('.sessions-decisions-file-line-counts'));
		const added = dom.append(lineCounts, $('span.sessions-decisions-file-lines-added'));
		added.textContent = `+${file.insertions}`;
		const removed = dom.append(lineCounts, $('span.sessions-decisions-file-lines-removed'));
		removed.textContent = `-${file.deletions}`;

		fileRow.setAttribute('aria-label', localize(
			'decisions.file.aria',
			"{0}, {1}, +{2} -{3}",
			file.fileName,
			file.directory || dirname(file.modifiedUri).path,
			file.insertions,
			file.deletions,
		));

		this._decisionsRenderDisposables.add(dom.addDisposableListener(fileRow, dom.EventType.CLICK, () => {
			this._openDecisionFile(file);
		}));

		return fileRow;
	}

	private _renderDecisionStats(parent: HTMLElement, decision: IDecision): void {
		const stats = dom.append(parent, $('.sessions-decisions-row-stats'));
		const fileLabel = decision.evidence.length === 1
			? localize('decisions.subtext.file', "1 file")
			: localize('decisions.subtext.files', "{0} files", decision.evidence.length);
		const fileSpan = dom.append(stats, $('span'));
		fileSpan.textContent = `${fileLabel} · `;
		const added = dom.append(stats, $('span.sessions-decisions-row-lines-added'));
		added.textContent = `+${decision.insertions}`;
		dom.append(stats, $('span')).textContent = ' ';
		const removed = dom.append(stats, $('span.sessions-decisions-row-lines-removed'));
		removed.textContent = `-${decision.deletions}`;
	}

	private async _openDecisionFile(file: IDecisionEvidenceFile): Promise<void> {
		const options = { pinned: true, preserveFocus: false };
		try {
			if (file.changeKind === 'deleted' && file.originalUri) {
				await this.editorService.openEditor({ resource: file.originalUri, options }, ACTIVE_GROUP);
				return;
			}
			if (file.originalUri) {
				await this.editorService.openEditor({
					original: { resource: file.originalUri },
					modified: { resource: file.modifiedUri },
					options,
				}, ACTIVE_GROUP);
				return;
			}
			await this.editorService.openEditor({ resource: file.modifiedUri, options }, ACTIVE_GROUP);
		} catch {
			// Swallow open failures — they would already surface via the editor service.
		}
	}

	override focus(): void {
		super.focus();

		if (this.tree && this.tree.getNode(null).visibleChildrenCount > 0) {
			this.tree.domFocus();
		}
	}

	private renderSidebarList(
		container: HTMLElement,
		onDidLayout: Event<{ readonly height: number; readonly width: number }>,
		items: IChangesFileItem[],
		openFileItem: (item: IChangesFileItem, items: IChangesFileItem[], sideBySide: boolean, preserveFocus: boolean, pinned: boolean, includeSidebar: boolean) => void,
	): IDisposable {
		const disposables = new DisposableStore();

		container.classList.add('changes-file-list');

		const viewMode = this.viewModel.viewModeObs.get();
		container.classList.toggle('list-mode', viewMode === ChangesViewMode.List);

		// "Changes" header
		const headerNode = dom.append(container, $('.changes-sidebar-header'));
		const headerLabel = dom.append(headerNode, $('span'));
		headerLabel.textContent = localize('changes', "Changes");
		const countBadge = disposables.add(new CountBadge(headerNode, { count: items.length }, defaultCountBadgeStyles));
		countBadge.setCount(items.length);

		const tree = this.createChangesTree(container, Event.None, disposables, () => tree.getSelection().filter(item => !!item && isChangesFileItem(item)));

		if (viewMode === ChangesViewMode.Tree) {
			tree.setChildren(null, buildTreeChildren(items, this.getTreeRootInfo(items)));
		} else {
			tree.setChildren(null, items.map(item => ({ element: item as ChangesTreeElement, collapsible: false })));
		}

		// Open file on selection. The `updatingSelection` guard relies on
		// `tree.setFocus`/`setSelection` firing events synchronously.
		let updatingSelection = false;
		disposables.add(tree.onDidOpen(e => {
			if (e.element && isChangesFileItem(e.element) && !updatingSelection) {
				openFileItem(e.element, items, e.sideBySide, !!e.editorOptions.preserveFocus, !!e.editorOptions.pinned, false /* preserve existing sidebar */);
			}
		}));

		// Track active editor and highlight in sidebar
		disposables.add(Event.runAndSubscribe(this.editorService.onDidActiveEditorChange, () => {
			const activeEditor = this.editorService.activeEditor;
			if (!activeEditor) {
				return;
			}

			const primaryResource = EditorResourceAccessor.getCanonicalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
			const secondaryResource = EditorResourceAccessor.getCanonicalUri(activeEditor, { supportSideBySide: SideBySideEditor.SECONDARY });

			const index = items.findIndex(i =>
				(primaryResource !== undefined && isEqual(i.uri, primaryResource)) ||
				(secondaryResource !== undefined && i.originalUri !== undefined && isEqual(i.originalUri, secondaryResource))
			);
			if (index >= 0) {
				updatingSelection = true;
				try {
					tree.setFocus([items[index]]);
					tree.setSelection([items[index]]);
					tree.reveal(items[index]);
				} finally {
					updatingSelection = false;
				}
			}
		}));

		// Layout on resize, accounting for the header height
		disposables.add(onDidLayout(e => {
			const headerHeight = headerNode.offsetHeight;
			tree.layout(Math.max(0, e.height - headerHeight), e.width);
		}));

		return disposables;
	}

	private createChangesTree(
		container: HTMLElement,
		onDidChangeVisibility: Event<boolean>,
		disposables: DisposableStore,
		getSelection?: () => IChangesFileItem[],
	): WorkbenchCompressibleObjectTree<ChangesTreeElement> {
		const resourceLabels = disposables.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility }));
		const actionRunner = disposables.add(new ChangesViewActionRunner(
			() => this.viewModel.activeSessionResourceObs.get(),
			() => this.getSessionDiscardRef(),
			getSelection ?? (() => this.getTreeSelection()),
		));
		return disposables.add(this.instantiationService.createInstance(
			WorkbenchCompressibleObjectTree<ChangesTreeElement>,
			'ChangesViewTree',
			container,
			new ChangesTreeDelegate(),
			[this.instantiationService.createInstance(ChangesTreeRenderer, this.viewModel, resourceLabels, actionRunner,
				() => {
					// Pass in the tree root to be used to compute the label description
					const activeSession = this.sessionManagementService.activeSession.get();
					const repository = activeSession?.workspace.get()?.repositories[0];
					return repository?.uri.scheme === GITHUB_REMOTE_FILE_SCHEME
						? URI.from({ scheme: Schemas.copilotPr, path: '/' })
						: repository?.workingDirectory ?? repository?.uri;
				})],
			{
				alwaysConsumeMouseWheel: false,
				accessibilityProvider: {
					getAriaLabel: (element: ChangesTreeElement) => isChangesFileItem(element) ? basename(element.uri) : element.name,
					getWidgetAriaLabel: () => localize('changesViewTree', "Changes Tree")
				},
				dnd: {
					getDragURI: (element: ChangesTreeElement) => element.uri.toString(),
					getDragLabel: (elements) => {
						const uris = elements.map(e => e.uri);
						if (uris.length === 1) {
							return this.labelService.getUriLabel(uris[0], { relative: true });
						}
						return `${uris.length}`;
					},
					dispose: () => { },
					onDragOver: () => false,
					drop: () => { },
					onDragStart: (data, originalEvent) => {
						try {
							const elements = data.getData() as ChangesTreeElement[];
							const uris = elements.filter(isChangesFileItem).map(e => e.uri);
							this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, uris, originalEvent));
						} catch {
							// noop
						}
					},
				},
				identityProvider: {
					getId: (element: ChangesTreeElement) => element.uri.toString()
				},
				indent: this.viewModel.viewModeObs.get() === ChangesViewMode.List ? 0 : 8,
				compressionEnabled: true,
				sorter: new ChangesTreeSorter(() => this.viewModel.viewModeObs.get()),
				twistieAdditionalCssClass: (e: unknown) => {
					return this.viewModel.viewModeObs.get() === ChangesViewMode.List
						? 'force-no-twistie'
						: undefined;
				},
			}
		));
	}

	async openChanges(resource?: URI): Promise<void> {
		const items = this.viewModel.activeSessionChangesObs.get();
		if (items.length === 0) {
			return;
		}

		const modalEditorMode = this.configurationService.getValue<string>('workbench.editor.useModal');
		if (modalEditorMode === 'all') {
			const changes = toIChangesFileItem(items);
			const changeToOpen = resource ? changes.find(c => isEqual(c.uri, resource)) : undefined;
			await this._openFileItem(changeToOpen ?? changes[0], changes, false, false, false, changes.length > 1);
			return;
		}

		// Open multi-file diff editor
		await this._openMultiFileDiffEditor(resource);
	}

	private async _openFileItem(item: IChangesFileItem, items: IChangesFileItem[], sideBySide: boolean, preserveFocus: boolean, pinned: boolean, includeSidebar: boolean): Promise<void> {
		const { uri: modifiedFileUri, originalUri, isDeletion } = item;
		const currentIndex = items.indexOf(item);

		const sidebar = includeSidebar ? {
			render: (container: unknown, onDidLayout: Event<{ readonly height: number; readonly width: number }>) => {
				return this.renderSidebarList(container as HTMLElement, onDidLayout, items, this._openFileItem.bind(this));
			}
		} : undefined;

		const navigation = {
			total: items.length,
			current: currentIndex,
			navigate: (index: number) => {
				const target = items[index];
				if (target) {
					this._openFileItem(target, items, false, false, false, includeSidebar);
				}
			}
		};

		const group = sideBySide ? SIDE_GROUP : ACTIVE_GROUP;

		if (isDeletion && originalUri) {
			this.editorService.openEditor({
				resource: originalUri,
				options: { preserveFocus, pinned, modal: { sidebar, navigation } }
			}, group);
			return;
		}

		if (originalUri) {
			this.editorService.openEditor({
				original: { resource: originalUri },
				modified: { resource: modifiedFileUri },
				options: { preserveFocus, pinned, modal: { sidebar, navigation } }
			}, group);
			return;
		}

		this.editorService.openEditor({
			resource: modifiedFileUri,
			options: { preserveFocus, pinned, modal: { sidebar, navigation } }
		}, group);
	}

	private async _openMultiFileDiffEditor(reveal?: URI): Promise<void> {
		const sessionResource = this.viewModel.activeSessionResourceObs.get();
		const changes = this.viewModel.activeSessionChangesObs.get();

		if (!sessionResource || changes.length === 0) {
			return;
		}

		// Determine the reveal target (original/modified URI pair) from the
		// current change list, so the multi-diff editor can navigate to it.
		let options: IMultiDiffEditorOptions | undefined;
		if (reveal) {
			const target = changes.find(c => isEqual(c.modifiedUri, reveal));
			if (target) {
				options = {
					viewState: {
						revealData: {
							resource: {
								original: target.originalUri,
								modified: target.modifiedUri,
							},
						},
					},
				} satisfies IMultiDiffEditorOptions;
			}
		}

		// Open the multi-diff editor using the sessions source URI. The resource
		// list is resolved via `SessionsMultiDiffSourceResolver` and updates
		// reactively as `activeSessionChangesObs` changes.
		await this.editorService.openEditor({
			multiDiffSource: getChangesMultiDiffSourceUri(sessionResource),
			label: localize('sessions.changes.title', 'Session Changes'),
			options,
		});
	}

	override dispose(): void {
		this.tree = undefined;
		super.dispose();
	}
}

export class ChangesViewPaneContainer extends ViewPaneContainer {
	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionService extensionService: IExtensionService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@ILogService logService: ILogService,
	) {
		super(CHANGES_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
	}

	override create(parent: HTMLElement): void {
		super.create(parent);
		parent.classList.add('changes-viewlet');
	}
}

// --- Action Runner

class ChangesViewActionRunner extends ActionRunner {

	constructor(
		private readonly getSessionResource: () => URI | undefined,
		private readonly getSessionDiscardRef: () => string,
		private readonly getSelectedFileItems: () => IChangesFileItem[]
	) {
		super();
	}

	protected override async runAction(action: IAction, context: ChangesTreeElement): Promise<void> {
		if (!(action instanceof MenuItemAction)) {
			return super.runAction(action, context);
		}

		const sessionResource = this.getSessionResource();
		const discardRef = this.getSessionDiscardRef();
		const selection = this.getSelectedFileItems();

		const contextIsSelected = selection.some(s => s === context);
		const actualContext = contextIsSelected ? selection : [context];
		const args = actualContext.map(e => {
			if (ResourceTree.isResourceNode(e)) {
				return ResourceTree.collect(e);
			}

			return isChangesFileItem(e) ? [e] : [];
		}).flat();
		await action.run(sessionResource, discardRef, ...args.map(item => item.uri));
	}
}

// --- Tree Delegate and Sorter

class ChangesTreeDelegate implements IListVirtualDelegate<ChangesTreeElement> {
	static readonly ROW_HEIGHT = 22;

	getHeight(_element: ChangesTreeElement): number {
		return ChangesTreeDelegate.ROW_HEIGHT;
	}

	getTemplateId(_element: ChangesTreeElement): string {
		return ChangesTreeRenderer.TEMPLATE_ID;
	}
}

class ChangesTreeSorter implements ITreeSorter<ChangesTreeElement> {
	constructor(private readonly viewMode: () => ChangesViewMode) { }

	compare(a: ChangesTreeElement, b: ChangesTreeElement): number {
		if (this.viewMode() === ChangesViewMode.List) {
			// List
			const aPath = (a as IChangesFileItem).uri.fsPath;
			const bPath = (b as IChangesFileItem).uri.fsPath;

			return comparePaths(aPath, bPath);
		}

		// Tree
		const aIsDirectory = ResourceTree.isResourceNode(a);
		const bIsDirectory = ResourceTree.isResourceNode(b);

		if (aIsDirectory !== bIsDirectory) {
			return aIsDirectory ? -1 : 1;
		}

		const aName = ResourceTree.isResourceNode(a)
			? a.name
			: basename((a as IChangesFileItem).uri);
		const bName = ResourceTree.isResourceNode(b)
			? b.name
			: basename((b as IChangesFileItem).uri);

		return compareFileNames(aName, bName);
	}
}

// --- View Mode Actions

class SetChangesListViewModeAction extends ViewAction<ChangesViewPane> {
	constructor() {
		super({
			id: 'workbench.changesView.action.setListViewMode',
			title: localize('setListViewMode', "View as List"),
			viewId: CHANGES_VIEW_ID,
			f1: false,
			icon: Codicon.listTree,
			toggled: ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.List),
			menu: {
				id: MenuId.ChatEditingSessionCodeOverflow,
				group: '1_viewmode',
				order: 1
			}
		});
	}

	async runInView(accessor: ServicesAccessor, view: ChangesViewPane): Promise<void> {
		logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.List);
		view.viewModel.setViewMode(ChangesViewMode.List);
	}
}

class SetChangesTreeViewModeAction extends ViewAction<ChangesViewPane> {
	constructor() {
		super({
			id: 'workbench.changesView.action.setTreeViewMode',
			title: localize('setTreeViewMode', "View as Tree"),
			viewId: CHANGES_VIEW_ID,
			f1: false,
			icon: Codicon.listFlat,
			toggled: ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.Tree),
			menu: {
				id: MenuId.ChatEditingSessionCodeOverflow,
				group: '1_viewmode',
				order: 2
			}
		});
	}

	async runInView(accessor: ServicesAccessor, view: ChangesViewPane): Promise<void> {
		logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.Tree);
		view.viewModel.setViewMode(ChangesViewMode.Tree);
	}
}

registerAction2(SetChangesListViewModeAction);
registerAction2(SetChangesTreeViewModeAction);

// --- Versions Picker Action

class VersionsPickerAction extends Action2 {
	static readonly ID = 'chatEditing.versionsPicker';

	constructor() {
		super({
			id: VersionsPickerAction.ID,
			title: localize2('chatEditing.versionsPicker', 'Versions'),
			category: CHAT_CATEGORY,
			icon: Codicon.listFilter,
			f1: false,
			menu: [{
				id: MenuId.ChatEditingSessionChangesFileHeaderToolbar,
				group: 'navigation',
				order: 9,
			}],
		});
	}

	override async run(): Promise<void> { }
}
registerAction2(VersionsPickerAction);

export class ChangesPickerActionItem extends ActionWidgetDropdownActionViewItem {
	private _sessionsContextKeyService!: IContextKeyService;
	private _versionModeAutorun: IDisposable | undefined;

	constructor(
		action: MenuItemAction,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsManagementService sessionManagementService: ISessionsManagementService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IViewsService private readonly viewsService: IViewsService,
		@ICommandService commandService: ICommandService,
	) {
		// Delegate to the SET_CODE_VIEW_MODE command so the context-key set happens at the
		// root scope (where the view-registry's `when` evaluator looks). Doing the bindTo
		// here on the picker's scoped contextKeyService would not propagate to the root.
		const switchCodeViewMode = async (mode: CodeViewMode) => {
			await commandService.executeCommand(SET_CODE_VIEW_MODE_COMMAND_ID, mode);
		};

		const setVersionMode = async (mode: ChangesVersionMode) => {
			await switchCodeViewMode(CodeViewMode.Changes);
			const view = await viewsService.openView<ChangesViewPane>(CHANGES_VIEW_ID, false);
			view?.viewModel.setVersionMode(mode);
			logChangesViewVersionModeChange(this.telemetryService, mode);
		};

		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const codeMode = (contextKeyService.getContextKeyValue<string>(ChangesContextKeys.CodeViewMode.key) as CodeViewMode) ?? CodeViewMode.Changes;
				const inChanges = codeMode === CodeViewMode.Changes;
				const view = viewsService.getViewWithId<ChangesViewPane>(CHANGES_VIEW_ID);
				const viewModel = view?.viewModel;
				const versionMode = viewModel?.versionModeObs.get();
				const state = viewModel?.activeSessionStateObs.get();
				const branchName = state?.branchName;
				const baseBranchName = state?.baseBranchName;
				const isCloud = viewModel?.activeSessionTypeObs.get() === COPILOT_CLOUD_SESSION_TYPE;
				const checkpointsAvailable = !viewModel || isCloud ||
					(viewModel.activeSessionFirstCheckpointRefObs.get() !== undefined &&
						viewModel.activeSessionLastCheckpointRefObs.get() !== undefined);

				const actions: IActionWidgetDropdownAction[] = [];

				actions.push({
					...action,
					id: 'chatEditing.versionsBranchChanges',
					label: localize('chatEditing.versionsBranchChanges', 'Branch Changes'),
					detail: branchName && baseBranchName ? `${branchName} -> ${baseBranchName}` : branchName,
					checked: inChanges && versionMode === ChangesVersionMode.BranchChanges,
					category: { label: 'changes', order: 1, showHeader: false },
					run: async () => {
						await setVersionMode(ChangesVersionMode.BranchChanges);
						if (this.element) { this.renderLabel(this.element); }
					},
				});

				if (!isWeb) {
					actions.push({
						...action,
						id: 'chatEditing.versionsUncommittedChanges',
						label: localize('chatEditing.versionsUncommittedChanges', 'Uncommitted Changes'),
						detail: localize('chatEditing.versionsUncommittedChanges.description', 'Show uncommitted changes in this session'),
						checked: inChanges && versionMode === ChangesVersionMode.UncommittedChanges,
						category: { label: 'changes', order: 2, showHeader: false },
						enabled: !isCloud,
						run: async () => {
							await setVersionMode(ChangesVersionMode.UncommittedChanges);
							if (this.element) { this.renderLabel(this.element); }
						},
					});
					actions.push({
						...action,
						id: 'chatEditing.versionsAllChanges',
						label: localize('chatEditing.versionsAllChanges', 'All Changes'),
						detail: localize('chatEditing.versionsAllChanges.description', 'Show all changes made in this session'),
						checked: inChanges && versionMode === ChangesVersionMode.AllChanges,
						category: { label: 'checkpoints', order: 3, showHeader: false },
						enabled: checkpointsAvailable,
						run: async () => {
							await setVersionMode(ChangesVersionMode.AllChanges);
							if (this.element) { this.renderLabel(this.element); }
						},
					});
					actions.push({
						...action,
						id: 'chatEditing.versionsLastTurnChanges',
						label: localize('chatEditing.versionsLastTurnChanges', "Last Turn's Changes"),
						detail: localize('chatEditing.versionsLastTurnChanges.description', 'Show only changes from the last turn'),
						checked: inChanges && versionMode === ChangesVersionMode.LastTurn,
						category: { label: 'checkpoints', order: 4, showHeader: false },
						enabled: checkpointsAvailable,
						run: async () => {
							await setVersionMode(ChangesVersionMode.LastTurn);
							if (this.element) { this.renderLabel(this.element); }
						},
					});
				}

				actions.push({
					...action,
					id: 'chatEditing.codeView.allFiles',
					label: localize('chatEditing.codeView.allFiles', "All Files"),
					detail: localize('chatEditing.codeView.allFiles.description', "Browse all files in the session workspace"),
					checked: codeMode === CodeViewMode.AllFiles,
					category: { label: 'browse', order: 5, showHeader: false },
					run: async () => {
						await switchCodeViewMode(CodeViewMode.AllFiles);
						if (this.element) { this.renderLabel(this.element); }
					},
				});

				actions.push({
					...action,
					id: 'chatEditing.codeView.decisions',
					label: localize('chatEditing.codeView.decisions', "Decisions"),
					detail: localize('chatEditing.codeView.decisions.description', "Review decisions and rationale from this session"),
					checked: codeMode === CodeViewMode.Decisions,
					category: { label: 'browse', order: 6, showHeader: false },
					run: async () => {
						await switchCodeViewMode(CodeViewMode.Decisions);
						if (this.element) { this.renderLabel(this.element); }
					},
				});

				return actions;
			},
		};

		super(action, { actionProvider, listOptions: {} }, actionWidgetService, keybindingService, contextKeyService, telemetryService);
		this._sessionsContextKeyService = contextKeyService;

		// Subscribe to versionMode changes from the Changes view (lazy, since the view may
		// not be instantiated yet when this picker is created in the Files/Decisions views).
		const trySubscribeViewModel = () => {
			if (this._versionModeAutorun) {
				return true;
			}
			const v = viewsService.getViewWithId<ChangesViewPane>(CHANGES_VIEW_ID);
			if (!v) {
				return false;
			}
			this._versionModeAutorun = this._register(autorun(reader => {
				v.viewModel.versionModeObs.read(reader);
				if (this.element) { this.renderLabel(this.element); }
			}));
			return true;
		};
		if (!trySubscribeViewModel()) {
			const sub = viewsService.onDidChangeViewVisibility(() => {
				if (trySubscribeViewModel()) {
					sub.dispose();
				}
			});
			this._register(sub);
		}

		const codeViewModeKeyName = ChangesContextKeys.CodeViewMode.key;
		this._register(contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([codeViewModeKeyName]))) {
				if (this.element) {
					this.renderLabel(this.element);
				}
			}
		}));
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		const codeMode = (this._sessionsContextKeyService.getContextKeyValue<string>(ChangesContextKeys.CodeViewMode.key) as CodeViewMode) ?? CodeViewMode.Changes;
		let label: string;
		if (codeMode === CodeViewMode.AllFiles) {
			label = localize('sessionsCode.allFiles', "All Files");
		} else if (codeMode === CodeViewMode.Decisions) {
			label = localize('sessionsCode.decisions', "Decisions");
		} else {
			const view = this.viewsService.getViewWithId<ChangesViewPane>(CHANGES_VIEW_ID);
			const mode = view?.viewModel.versionModeObs.get();
			label = mode === ChangesVersionMode.UncommittedChanges
				? localize('sessionsChanges.versionsUncommittedChanges', 'Uncommitted Changes')
				: mode === ChangesVersionMode.AllChanges
					? localize('sessionsChanges.versionsAllChanges', "All Changes")
					: mode === ChangesVersionMode.LastTurn
						? localize('sessionsChanges.versionsLastTurn', "Last Turn's Changes")
						: localize('sessionsChanges.versionsBranchChanges', "Branch Changes");
		}

		dom.reset(element, dom.$('span', undefined, label), ...renderLabelWithIcons('$(chevron-down)'));
		this.updateAriaLabel();
		return null;
	}
}
