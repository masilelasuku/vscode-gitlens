import { TextDocumentShowOptions, TextEditor, Uri } from 'vscode';
import { FileAnnotationType } from '../configuration';
import { Commands, GlyphChars, quickPickTitleMaxChars } from '../constants';
import type { Container } from '../container';
import { GitUri } from '../git/gitUri';
import { GitReference } from '../git/models';
import { Messages } from '../messages';
import { StashPicker } from '../quickpicks/commitPicker';
import { ReferencePicker } from '../quickpicks/referencePicker';
import { command } from '../system/command';
import { pad } from '../system/string';
import { ActiveEditorCommand, getCommandUri } from './base';
import { GitActions } from './gitCommands.actions';

export interface OpenFileAtRevisionFromCommandArgs {
	reference?: GitReference;

	line?: number;
	showOptions?: TextDocumentShowOptions;
	annotationType?: FileAnnotationType;
	stash?: boolean;
}

@command()
export class OpenFileAtRevisionFromCommand extends ActiveEditorCommand {
	constructor(private readonly container: Container) {
		super(Commands.OpenFileAtRevisionFrom);
	}

	async execute(editor: TextEditor | undefined, uri?: Uri, args?: OpenFileAtRevisionFromCommandArgs) {
		uri = getCommandUri(uri, editor);
		if (uri == null) return;

		const gitUri = await GitUri.fromUri(uri);
		if (!gitUri.repoPath) {
			void Messages.showNoRepositoryWarningMessage('Unable to open file revision');
			return;
		}

		args = { ...args };
		if (args.line == null) {
			args.line = editor?.selection.active.line ?? 0;
		}

		if (args.reference == null) {
			if (args?.stash) {
				const path = this.container.git.getRelativePath(gitUri, gitUri.repoPath);

				const title = `Open Changes with Stash${pad(GlyphChars.Dot, 2, 2)}`;
				const pick = await StashPicker.show(
					this.container.git.getStash(gitUri.repoPath),
					`${title}${gitUri.getFormattedFileName({ truncateTo: quickPickTitleMaxChars - title.length })}`,
					'Choose a stash to compare with',
					// Stashes should always come with files, so this should be fine (but protect it just in case)
					{ filter: c => c.files?.some(f => f.path === path || f.originalPath === path) ?? true },
				);
				if (pick == null) return;

				args.reference = pick;
			} else {
				const title = `Open File at Branch or Tag${pad(GlyphChars.Dot, 2, 2)}`;
				const pick = await ReferencePicker.show(
					gitUri.repoPath,
					`${title}${gitUri.getFormattedFileName({ truncateTo: quickPickTitleMaxChars - title.length })}`,
					'Choose a branch or tag to open the file revision from',
					{
						allowEnteringRefs: true,
						keys: ['right', 'alt+right', 'ctrl+right'],
						onDidPressKey: async (key, quickpick) => {
							const [item] = quickpick.activeItems;
							if (item != null) {
								void (await GitActions.Commit.openFileAtRevision(
									this.container.git.getRevisionUri(item.ref, gitUri.fsPath, gitUri.repoPath!),
									{
										annotationType: args!.annotationType,
										line: args!.line,
										preserveFocus: true,
										preview: false,
									},
								));
							}
						},
					},
				);
				if (pick == null) return;

				args.reference = pick;
			}
		}

		void (await GitActions.Commit.openFileAtRevision(
			this.container.git.getRevisionUri(args.reference.ref, gitUri.fsPath, gitUri.repoPath),
			{
				annotationType: args.annotationType,
				line: args.line,
				...args.showOptions,
			},
		));
	}
}
