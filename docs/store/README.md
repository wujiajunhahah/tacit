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
bun run build && cd extension && zip -r ../tacit-extension-v0.1.0.zip manifest.json popup.html dist icons
```

## What you do

1. Commit and push, so `https://github.com/wujiajunhahah/tacit/blob/main/PRIVACY.md` resolves.
2. Register at the [developer dashboard](https://chrome.google.com/webstore/devconsole) and pay the one-time $5 fee. Finish whatever the Account tab asks for.
3. **New item**, then upload `tacit-extension-v0.1.0.zip`.
4. **Store listing:** paste from `listing.md`, upload the images in the order it gives.
5. **Privacy practices:** paste from `permissions.md`, tick the three data types and the three certifications, add the privacy policy URL.
6. **Distribution:** public, all regions, unless you want an unlisted beta first.
7. **Submit for review.** Access to all sites usually means an in-depth review, so expect days rather than hours.
8. Once it is live: put the store link in the README quick start, and tick "Chrome Web Store release" in Status.

## Worth deciding before you submit

- **Drop `tabs`.** With `<all_urls>` granted, the popup and the service worker still read tab addresses without it (checked in Chromium). It only matters when someone withholds site access, and there Tacit cannot read the page anyway. One less permission for the reviewer to question.
- **Narrow `<all_urls>`** to `http://*/*` and `https://*/*`. The content script only runs on those, and the harness at `http://127.0.0.1:7766` is covered; `<all_urls>` also grants `file://` pages, which Tacit never uses. Checked in Chromium together with dropping `tabs`: the line still mounts, tab addresses are readable, and visits reach the harness.
- **The 简体中文 listing** needs `_locales/zh_CN` (and `default_locale`) in the package; the dashboard only offers languages the package ships.
- **Version.** This zip differs from the v0.1.0 release asset in two strings: the manifest description (cut from 136 to 123 characters, under Chrome's 132 limit) and the popup's subtitle (now "Local by default."). Tag v0.1.1 if you want the store build and a GitHub release to match.

If you drop a permission, delete its block in `permissions.md`.
