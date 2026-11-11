# QA checklist

## Checks run while preparing this source ZIP

- [x] Node syntax checks for backend modules, including the YouTube discovery service.
- [x] JSX syntax parse for React entry and application files using the globally available TypeScript parser.
- [x] JSON validation for package manifest and PWA web manifest.
- [x] URL/IP/allowlist security tests and YouTube service tests: 10 passed.
- [ ] Install npm dependencies in this environment.
- [ ] Build the production frontend with Vite.
- [ ] Start the Express server and exercise API endpoints end to end.
- [ ] Browser-run visual/responsive test at all specified viewport widths.
- [ ] Test an authorized direct-media host and a real FFmpeg conversion end to end.

The npm install step was attempted during preparation but could not complete because DNS resolution to the npm registry failed in the build environment. The full Vite production build and browser end-to-end flows therefore remain unverified here. The source ZIP does not include `node_modules`. Complete the unchecked items after installing dependencies on your computer; do not interpret static parsing and unit tests as full end-to-end verification.

## Suggested local verification

```bash
npm install
npm run check
npm test
npm run build
npm run dev
```

Then open `http://127.0.0.1:5173`, test the backend status, import a permitted media file, try library/playback/playlist/history operations, and use a small audio/video sample to check conversion. Only test remote downloads on hostnames you own or are authorized to use, after adding those hostnames to `.env`.
