# Push To GitHub Instructions

Feed this file to Codex whenever you want changes committed and pushed to GitHub.

## Required Rules

- Inspect `git status -sb` and the diff before staging.
- Do not stage unrelated files or generated noise unless I explicitly approve them.
- Before every push, confirm whether the change needs a version bump and release notes.
- For HAFlow app changes, bump all version locations together:
  - `package.json`
  - `package-lock.json`
  - `config.yaml`
- Add or update `CHANGELOG.md` for user-facing changes, fixes, behavior changes, or release-worthy maintenance.
- Run validation before committing:
  - `npm run build`
  - `npm run lint`
- Commit with a clear, short message.
- Push the current branch.
- If a pull request is needed, open it as draft by default unless I say to merge directly.
- If an existing PR exists for the branch, update that PR instead of opening a duplicate.
- Do not merge a PR until I explicitly ask you to merge/commit it to `main`.

## Preferred Flow

1. Check branch, remotes, auth, and worktree status.
2. Review the changed files and summarize the intended commit scope.
3. Apply any missing version and changelog updates.
4. Run `npm run build` and `npm run lint`.
5. Stage only the approved files.
6. Commit.
7. Push.
8. Report the branch, commit hash, PR link if any, version number, changelog entry, and validation results.

## Direct Merge Flow

When I say to merge, commit it, or put it on `main`:

1. Verify the PR or branch contents first.
2. Confirm there are release notes and version bumps when required.
3. Merge only the intended PR or branch.
4. Sync the local checkout back to `main`.
5. Confirm `git status -sb` is clean and aligned with `origin/main`.
