# qrcode-generator

Vendored, unmodified ESM distribution of qrcode-generator 2.0.4 by Kazuhiko Arase.

- Upstream: https://github.com/kazuhikoarase/qrcode-generator
- Commit: `83b7e8fe3fddd3b0368dbafd6ce56995bd25e3c8`
- Source: `js/dist/qrcode.mjs`
- SHA-256: `ea91d7118a5395289170da848b7c6758b996163bfbccf312591ab65a4911b7c0`
- License: MIT, preserved in `LICENSE` and the source header.

`qrcode.d.mts` is an app-owned declaration of the subset used by the app.
`app/lib/qr.ts` supplies UTF-8 encoding and a scalable SVG with a four-module
quiet zone. Generating or viewing a QR code sends no data to an external QR service.
