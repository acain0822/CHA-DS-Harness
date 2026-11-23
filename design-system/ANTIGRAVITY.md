# Antigravity: bring the personal repo's work into the work repo

Follow the steps in order. Run one command at a time. Compare the output with **Expect**. If it doesn't match, do what **Stop** says.

## Rules

1. Do only these steps. Don't improve, refactor, rename or reformat anything.
2. Never push to `main`. Never push to `personal`. Never use `--force`, `reset --hard` or `git clean`.
3. Don't make Figma calls.
4. Don't edit a test to make it pass.
5. Don't build approvals, sign-offs or gates. That idea was tried and rejected.
6. When told to stop: run no more commands, show the person the last command and its full output, and wait.

## Words

- **Work repo:** `acain0822/CHA-City-DS-Harness`. You work here. Its remote is `origin`.
- **Personal repo:** `acain0822/CHA-DS-Harness`. You only read from it. Its remote is `personal`.

## Part 1: check where you are

Open a terminal in the work repo folder.

```bash
git remote get-url origin
```
Expect: ends with `CHA-City-DS-Harness` or `CHA-City-DS-Harness.git`. Stop if not.

```bash
git status --short
```
Expect: nothing printed. Stop if anything is printed, because someone has unsaved work.

```bash
node --version
```
Expect: `v22` or higher. Stop if not.

```bash
git switch main
```
```bash
git pull --ff-only origin main
```
Expect: `Already up to date.` or a list of updated files. Stop on any error.

## Part 2: connect to the personal repo, read only

```bash
git remote add personal https://github.com/acain0822/CHA-DS-Harness.git
```
Expect: nothing. If it says `remote personal already exists`, that's fine.

```bash
git remote set-url --push personal DISABLED
```
```bash
git fetch personal
```
Expect: no error.

```bash
git merge-base --is-ancestor 51bcd18 personal/main && echo FOUND
```
Expect: `FOUND`. Stop if not.

```bash
git log --oneline --grep="cherry picked from commit 51bcd18"
```
Expect: nothing. Stop if a line is printed, because this was already done.

## Part 3: bring the work over

```bash
git switch -c from-personal
```
Expect: `Switched to a new branch 'from-personal'`. Stop if the branch already exists.

```bash
git cherry-pick -x 267049c..personal/main
```
Expect: an error saying it could not apply `51bcd18`. This is normal.

```bash
git diff --name-only --diff-filter=U
```
Expect: exactly one line, `package.json`.
Stop if any other file is listed. First run `git cherry-pick --abort`.

Fix `package.json` with these commands. Don't edit it by hand.

```bash
git checkout --theirs package.json
```
```bash
npm pkg set scripts.analytics="node scripts/usage_analytics.mjs"
```
```bash
git add package.json
```
```bash
git -c core.editor=true cherry-pick --continue
```
```bash
git status
```
Expect: `nothing to commit, working tree clean`, and no mention of cherry-picking.
Stop if not. First run `git cherry-pick --abort`.

## Part 4: remove old usage numbers from four stories

These stories have usage numbers typed in by hand, and the numbers are wrong. Take the personal repo's versions.

```bash
git checkout personal/main -- src/components/Button/Button.stories.tsx src/components/Checkbox/Checkbox.stories.tsx src/components/InputField/InputField.stories.tsx src/components/TextLink/TextLink.stories.tsx
```
```bash
git grep -n "Usage Analytics" -- src/components
```
Expect: nothing. Stop if a line is printed.

```bash
git commit -m "Remove hand-typed usage numbers from stories"
```
Expect: `4 files changed`.

## Part 5: check it

```bash
npm ci
```
Expect: no line starting with `npm error`.

```bash
npx playwright install chromium
```
```bash
npm run typecheck
```
Expect: no errors.

```bash
npm run test:harness
```
Expect: `pass 31`, `fail 0`, then `tests pass`.

```bash
npm run test:a11y
```
Expect: `56 passed`.

```bash
npm run build:package
```
Expect: `Built @cha/design-system 0.1.0: 5 components, 150 tokens.`

```bash
node scripts/harness.mjs check --no-write
```
Expect: `0 errors`. Warnings and open questions are normal.

```bash
git status --short
```
Expect: nothing printed.

Stop if any result differs. Don't try to fix it.

## Part 6: let the person look

```bash
npm run storybook
```
Open http://localhost:6006 and go to **Components > Actions > Button > Docs**. Expect a live button at the top, options below it, then states.

Press Ctrl-C to stop Storybook. Then tell the person:

> The work is on the local branch `from-personal` and all checks passed. Nothing is pushed. May I push this branch to the work repo? It's public.

Wait for a clear yes. Then run:

```bash
git push -u origin from-personal
```

Don't open a pull request and don't merge. The person does that.

## Undo

Nothing has reached `main`, so this is safe:

```bash
git switch main
```

Leave the `from-personal` branch alone unless the person asks you to delete it.

## What the project is for

1. Live documentation of the design system and how it's used.
2. One place for developers to pull components from, whatever they're building.
3. Documentation of where variants get their properties.
4. Design-to-code and code-to-design, with checks only when the shared system changes.

Using a component never needs permission. The plan is in `design-system/HARNESS.md`.

## Facts to remember

- "Not measured" isn't zero. Never replace it with 0 or a guess.
- Don't edit `src/tokens/tokens.css` or anything in `package-dist/`. They're generated.
- Storybook component pages are `src/components/<Name>/<Name>.mdx`. Keep the live component first.
- Don't change the component map, package name or token names without being asked.
- Don't share numbers from **Design QA**'s audit dashboard or `usage-analytics.json`. They're known to be wrong.
- Don't publish the package.
