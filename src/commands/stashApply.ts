import { GitActions } from '../commands/gitCommands.actions';
import { Commands } from '../constants';
import type { Container } from '../container';
import { GitStashCommit, GitStashReference } from '../git/models';
import { CommandQuickPickItem } from '../quickpicks/items/common';
import { command } from '../system/command';
import {
	Command,
	CommandContext,
	isCommandContextViewNodeHasCommit,
	isCommandContextViewNodeHasRepository,
} from './base';

export interface StashApplyCommandArgs {
	deleteAfter?: boolean;
	repoPath?: string;
	stashItem?: GitStashReference & { message: string | undefined };

	goBackCommand?: CommandQuickPickItem;
}

@command()
export class StashApplyCommand extends Command {
	constructor(private readonly container: Container) {
		super(Commands.StashApply);
	}

	protected override async preExecute(context: CommandContext, args?: StashApplyCommandArgs) {
		if (isCommandContextViewNodeHasCommit<GitStashCommit>(context)) {
			if (context.node.commit.message == null) {
				await context.node.commit.ensureFullDetails();
			}
			args = { ...args, stashItem: context.node.commit };
		} else if (isCommandContextViewNodeHasRepository(context)) {
			args = { ...args, repoPath: context.node.repo.path };
		}

		return this.execute(args);
	}

	async execute(args?: StashApplyCommandArgs) {
		if (args?.deleteAfter) {
			return GitActions.Stash.pop(args?.repoPath ?? args?.stashItem?.repoPath, args?.stashItem);
		}

		return GitActions.Stash.apply(args?.repoPath ?? args?.stashItem?.repoPath, args?.stashItem);
	}
}
