# Chrome Web Store kit

Everything needed to list Tacit on the Chrome Web Store. Nothing has been submitted.

| File | For |
|---|---|
| [listing.md](listing.md) | Store listing tab: name, summary, category, descriptions in English and 简体中文, single purpose, links, which image goes where |
| [permissions.md](permissions.md) | Privacy practices tab: permission justifications, remote code, data usage, exactly what reaches Jev |
| [PRIVACY.md](../../PRIVACY.md) | The privacy policy URL |
| `screenshot-*.png`, `promo-small.png`, `icon-128.png` | Graphic assets: five 1280×800 screenshots, the 440×280 small promo tile, the 128×128 store icon |

Re-render the images after a UI change (real Chromium, the built extension, the demo site and a throwaway harness on port 7766):

```bash
bun run store
```

Build the upload, the same way `.github/workflows/release.yml` does:

```bash
bun run build && cd extension && zip -r ../tacit-extension-v0.2.0.zip manifest.json popup.html _locales dist icons
```

## What you do

1. Commit and push, so `https://github.com/wujiajunhahah/tacit/blob/main/PRIVACY.md` resolves.
2. Register at the [developer dashboard](https://chrome.google.com/webstore/devconsole) and pay the one-time $5 fee. Finish whatever the Account tab asks for.
3. **New item**, then upload `tacit-extension-v0.2.0.zip` (the same file is attached to the [v0.2.0 release](https://github.com/wujiajunhahah/tacit/releases/tag/v0.2.0)).
4. **Store listing:** paste from `listing.md`, upload the images in the order it gives. Add the 简体中文 listing too: the package ships `_locales/zh_CN`.
5. **Privacy practices:** paste from `permissions.md`, tick the three data types and the three certifications, add the privacy policy URL.
6. **Distribution:** public, all regions, unless you want an unlisted beta first.
7. **Submit for review.** Access to all sites usually means an in-depth review, so expect days rather than hours.
8. Once it is live: put the store link in the README quick start, and tick "Chrome Web Store release" in Status.

## Done in 0.2.0

- **No `tabs` permission.** The popup reads the active tab's address through host access; tab events, messaging a tab and opening one need no permission. Checked in Chromium.
- **Host access narrowed** from `<all_urls>` to `http://*/*` and `https://*/*`: Tacit never reads `file://` pages, and the harness at `http://127.0.0.1:7766` is covered.
- **A 简体中文 listing is possible:** the package ships `_locales/en` and `_locales/zh_CN`.
