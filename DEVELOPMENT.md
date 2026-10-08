# Development Guide

Personal reference for working on and publishing `transcribe-cli`.

---

## Daily Development (No Build Required)

The repository is a pnpm workspace (`pnpm-workspace.yaml`): the published CLI lives in `apps/cli`,
and the root `package.json` only holds aliases and the shared tooling. Install once with
`pnpm install`.

While making changes, run the app directly from source using `tsx`. No compilation needed.

```bash
pnpm start
```

This runs `apps/cli/src/index.tsx` through `tsx`, which executes TypeScript on the fly. Fast
iteration, no build step. Any script of the CLI can be reached from the root with
`pnpm cli <script>`.

---

## Testing as a Global Binary (Without Publishing)

Use `npm link` to register the command globally on your machine, pointing directly at your local project folder.

```bash
# 1. Compile the source
pnpm build

# 2. Register the command globally
cd apps/cli && npm link
```

Now `transcribe-cli` works from any terminal on your machine and points to your local `dist/`.
Every time you rebuild (`pnpm build`), the global command reflects the changes immediately.

### To unlink (remove the global command)
```bash
npm unlink -g @bryan-gc/transcribe-cli
```

---

## Automated Publishing via GitHub Actions (Trusted Publishers)

This project uses **NPM Trusted Publishers (OIDC)** to automatically and securely publish new versions to NPM from GitHub Actions, generating an authentic "Provenance" signature.

### One-Time Setup (NPM)
To link NPM with GitHub securely, fill out the form in your NPM package settings (`Settings -> Trusted publishing`):

- **Publisher**: `GitHub Actions`
- **Organization or user**: `bryan-gc`
- **Repository**: `transcribe-cli`
- **Workflow filename**: `publish.yml`
- **Environment name**: *(leave blank)*

> **Security Tip**: After linking, go to `Publishing access` in the same NPM settings and select **"Require two-factor authentication and disallow tokens"**. Your GitHub Action will still work perfectly via OIDC, but your account will be locked down against traditional token theft.

### How to Release a New Version

We no longer run `npm publish` locally. Instead, we let GitHub Actions do it automatically.

1. **Commit your latest changes**:
```bash
git add .
git commit -m "feat: describe your changes"
```

2. **Bump the version**:
```bash
pnpm release patch
```
*(This runs `pnpm version patch` inside `apps/cli`: it updates `apps/cli/package.json`, commits it as the bare version number and creates the `v*` tag locally. Use `minor` or `major` instead of `patch` if needed. Going through `pnpm --filter` would skip the commit and the tag, which is why `release` changes directory instead).*

3. **Push the code and the Tag to GitHub**:
```bash
git push --follow-tags
```
*(`--follow-tags` pushes both your commits and the tag `pnpm release` just created. As soon as the tag reaches GitHub, `publish.yml` runs.)*

4. **Monitor the Action in GitHub**:
Go to your repository on GitHub.com and click the **Actions** tab. You will see a workflow running. Once it finishes (it usually takes around 1 minute), your new version will be live on NPM with the Provenance badge.

### After publishing, update your global install locally:
```bash
npm install -g @bryan-gc/transcribe-cli
```

---

## Workflow Summary

| Scenario | Command |
|---|---|
| Quick development | `pnpm start` |
| Test as global binary locally | `pnpm try:global` |
| Release a new version | `pnpm release patch` -> `git push --follow-tags` |
| Update global install after release | `npm install -g @bryan-gc/transcribe-cli` |

---

## Config File Location

User configuration is stored at:
```
~/.transcribe-cli/config.json
```

To reset the configuration (re-run setup), simply delete that file:
```bash
rm ~/.transcribe-cli/config.json
```
