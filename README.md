# plainmd

Turn any article or selection into clean Markdown for Obsidian, notes or LLM prompts. No signup, no limits, no tracking.

Chrome extension (Manifest V3). Built with AI assistance.

## Build
`python3 build.py` → zip for the Chrome Web Store.

## Privacy
See [PRIVACY.md](PRIVACY.md).

## Third-party code
See `ext/vendor/` (licenses included). `ExtPay.module.js` (ExtensionPay, LGPL-3.0 per upstream LICENSE) is modified here to call the native `chrome.*` promise APIs instead of importing webextension-polyfill; that file stays under its own license.

## License
MIT (except `ext/vendor/`)
