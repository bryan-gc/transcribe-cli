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

## Publishing a New Version to NPM

Only do this when the feature/fix is ready and tested.

```bash
# 1. Bump the version (patch = 1.0.x, minor = 1.x.0, major = x.0.0)
npm version patch --no-git-tag-version

# 2. Build + publish (prepublishOnly runs build automatically)
npm publish --access public
```

### After publishing, update your global install:
```bash
npm install -g @bryan-gc/transcribe-cli
```

---

## Workflow Summary

| Scenario | Command |
|---|---|
| Quick development | `npm start` |
| Test as global binary locally | `npm run build && npm link` |
| Release a new version | `npm version patch --no-git-tag-version && npm publish --access public` |
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

---

## NPM Token Setup (if auth fails)

If `npm publish` returns a 403, set your granular access token:
```bash
npm set //registry.npmjs.org/:_authToken=npm_XXXXXXXXXXXXXXXX
```

Generate the token at: **npmjs.com → Avatar → Access Tokens → Generate New Token → Granular Access Token**
Make sure to enable **"Bypass two-factor authentication"** when creating it.
