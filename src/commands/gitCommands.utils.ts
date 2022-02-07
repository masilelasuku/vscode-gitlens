import { GitCommandSorting } from '../config';
import type { Container } from '../container';
import { Usage, WorkspaceState } from '../storage';
import { BranchGitCommand } from './git/branch';
import { CherryPickGitCommand } from './git/cherry-pick';
import { CoAuthorsGitCommand } from './git/coauthors';
import { FetchGitCommand } from './git/fetch';
import { LogGitCommand } from './git/log';
import { MergeGitCommand } from './git/merge';
import { PullGitCommand } from './git/pull';
import { PushGitCommand } from './git/push';
import { RebaseGitCommand } from './git/rebase';
import { ResetGitCommand } from './git/reset';
import { RevertGitCommand } from './git/revert';
import { SearchGitCommand } from './git/search';
import { ShowGitCommand } from './git/show';
import { StashGitCommand } from './git/stash';
import { StatusGitCommand } from './git/status';
import { SwitchGitCommand } from './git/switch';
import { TagGitCommand } from './git/tag';
import type { GitCommandsCommandArgs } from './gitCommands';
import type { QuickCommand, QuickPickStep, StepGenerator } from './quickCommand';

function* nullSteps(): StepGenerator {
	/* noop */
}

export function getSteps(
	container: Container,
	args: GitCommandsCommandArgs,
	pickedVia: 'menu' | 'command',
): StepGenerator {
	const commandsStep = new PickCommandStep(container, args);

	const command = commandsStep.find(args.command);
	if (command == null) return nullSteps();

	commandsStep.setCommand(command, pickedVia);

	return command.executeSteps();
}

export class PickCommandStep implements QuickPickStep {
	readonly buttons = [];
	private readonly hiddenItems: QuickCommand[];
	ignoreFocusOut = false;
	readonly items: QuickCommand[];
	readonly matchOnDescription = true;
	readonly placeholder = 'Choose a git command';
	readonly title = 'GitLens';

	constructor(private readonly container: Container, args?: GitCommandsCommandArgs) {
		this.items = [
			new BranchGitCommand(container, args?.command === 'branch' ? args : undefined),
			new CherryPickGitCommand(container, args?.command === 'cherry-pick' ? args : undefined),
			new CoAuthorsGitCommand(container, args?.command === 'co-authors' ? args : undefined),
			new FetchGitCommand(container, args?.command === 'fetch' ? args : undefined),
			new LogGitCommand(container, args?.command === 'log' ? args : undefined),
			new MergeGitCommand(container, args?.command === 'merge' ? args : undefined),
			new PullGitCommand(container, args?.command === 'pull' ? args : undefined),
			new PushGitCommand(container, args?.command === 'push' ? args : undefined),
			new RebaseGitCommand(container, args?.command === 'rebase' ? args : undefined),
			new ResetGitCommand(container, args?.command === 'reset' ? args : undefined),
			new RevertGitCommand(container, args?.command === 'revert' ? args : undefined),
			new SearchGitCommand(container, args?.command === 'search' || args?.command === 'grep' ? args : undefined),
			new ShowGitCommand(container, args?.command === 'show' ? args : undefined),
			new StashGitCommand(container, args?.command === 'stash' ? args : undefined),
			new StatusGitCommand(container, args?.command === 'status' ? args : undefined),
			new SwitchGitCommand(
				container,
				args?.command === 'switch' || args?.command === 'checkout' ? args : undefined,
			),
			new TagGitCommand(container, args?.command === 'tag' ? args : undefined),
		];

		if (this.container.config.gitCommands.sortBy === GitCommandSorting.Usage) {
			const usage = this.container.storage.getWorkspace<Usage>(WorkspaceState.GitCommandPaletteUsage);
			if (usage != null) {
				this.items.sort((a, b) => (usage[b.key] ?? 0) - (usage[a.key] ?? 0));
			}
		}

		this.hiddenItems = [];
	}

	private _command: QuickCommand | undefined;
	get command(): QuickCommand | undefined {
		return this._command;
	}

	find(commandName: string, fuzzy: boolean = false) {
		if (fuzzy) {
			const cmd = commandName.toLowerCase();
			return this.items.find(c => c.isFuzzyMatch(cmd)) ?? this.hiddenItems.find(c => c.isFuzzyMatch(cmd));
		}

		return this.items.find(c => c.isMatch(commandName)) ?? this.hiddenItems.find(c => c.isMatch(commandName));
	}

	setCommand(command: QuickCommand | undefined, via: 'menu' | 'command'): void {
		if (this._command != null) {
			this._command.picked = false;
		}

		if (command != null) {
			command.picked = true;
			command.pickedVia = via;
		}

		this._command = command;
		if (command != null) {
			void this.updateCommandUsage(command.key, Date.now());
		}
	}

	private async updateCommandUsage(id: string, timestamp: number) {
		let usage = this.container.storage.getWorkspace<Usage>(WorkspaceState.GitCommandPaletteUsage);
		if (usage === undefined) {
			usage = Object.create(null) as Usage;
		}

		usage[id] = timestamp;
		await this.container.storage.storeWorkspace(WorkspaceState.GitCommandPaletteUsage, usage);
	}
}
