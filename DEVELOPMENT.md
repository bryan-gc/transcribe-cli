# Development Guide

Personal reference for working on and publishing `transcribe-cli`.

---

## Daily Development (No Build Required)

While making changes, run the app directly from source using `tsx`. No compilation needed.

```bash
npm start
```

This runs `tsx src/index.tsx` which executes TypeScript on the fly. Fast iteration, no build step.

---

## Testing as a Global Binary (Without Publishing)

Use `npm link` to register the command globally on your machine, pointing directly at your local project folder.

```bash
# 1. Compile the source
npm run build

# 2. Register the command globally
npm link
```

Now `transcribe-cli` works from any terminal on your machine and points to your local `dist/`.
Every time you rebuild (`npm run build`), the global command reflects the changes immediately.

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
npm version patch
```
*(This command automatically updates `package.json` to the next version and creates a Git Tag locally. Use `minor` or `major` instead of `patch` if needed).*

3. **Push the code and the Tag to GitHub**:
```bash
git push --follow-tags
```
*(El flag `--follow-tags` empuja tanto tus commits (el código) como el nuevo tag que `npm version` acaba de crear. Al llegar el tag a GitHub, se dispara inmediatamente nuestro archivo `publish.yml`).*

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
| Quick development | `npm run start` |
| Test as global binary locally | `npm run build && npm link` |
| Release a new version | `npm version patch` -> `git push` -> `git push origin v1.0.X` |
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
