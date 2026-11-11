# ZeeTube

ZeeTube is a responsive video-discovery and personal media app. It uses the official YouTube Data API for public video search and regional trends, the official YouTube embedded player for playback, and an authorized direct-media/local library for files you have permission to keep. It includes a React/Vite frontend, an Express REST API, persistent file-backed storage by default, optional MongoDB storage, and FFmpeg-based audio extraction.

> **Honest scope note:** ZeeTube discovers public YouTube videos through the official Data API (when a server-side API key is configured) and plays them using the official embedded player. It is not a universal website downloader. Downloads are limited to local media and **authorized direct audio/video file URLs** on an explicit host allowlist. YouTube watch pages, livestream manifests, protected streams, DRM, login/paywall bypass, and sources not permitted by their platform are not supported. The app is configured for local single-user use and should not be exposed publicly without additional authentication and security work.

## Features included

- Premium white-first responsive interface with optional dark theme, optimized for desktop, tablet, and mobile.
- Pakistan-region YouTube trending feed, category browsing, public-video search, official embedded playback, plus the personal media library, download queue, audio extractor, playlists, history, favorites, and settings.
- Import supported video/audio files into managed local storage.
- Browser media playback with range-request streaming, download links, and saved playback positions.
- Persistent library, playlists, playback history, settings, conversion jobs, and download jobs.
- Direct file inspection and transfer only from explicitly configured allowed hosts.
- Download progress, queue states, cancel, retry, error handling, and completed downloads added to the library.
- FFmpeg/FFprobe audio extraction to MP3, M4A, or WAV, with conversion status and output added to the library.
- URL host allowlisting, private/reserved IP blocking, redirect revalidation, upload/download size limits, rate limiting, security headers, path checks, and managed-storage cleanup.
- Automated security and YouTube API configuration/search tests.

## Requirements

- Node.js 20.19+ or 22.12+ and npm (required by the current Vite toolchain).
- FFmpeg and FFprobe for audio extraction (recommended package name on Linux Mint/Ubuntu: `ffmpeg`).
- MongoDB only if you choose the optional MongoDB storage driver. The default file-backed driver does not require a database server.

On Linux Mint/Ubuntu, FFmpeg can usually be installed with:

```bash
sudo apt update
sudo apt install ffmpeg
ffmpeg -version
ffprobe -version
```

Use a supported current Node.js release if your distribution repository offers an older version.

## Install and run

1. Extract the ZIP archive and open a terminal in the `zeetube` project folder.
2. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

3. Install JavaScript dependencies:

   ```bash
   npm install
   ```

4. Start the frontend and API together:

   ```bash
   npm run dev
   ```

   Alternatively, on Linux Mint/Ubuntu run `./run-linux.sh`; on Windows run `run-windows.bat`. These scripts initialize `.env` if needed and install dependencies when `node_modules` is missing.

5. Open `http://127.0.0.1:5173` in your browser. The API runs at `http://127.0.0.1:5050`.

The default storage folder is `storage/` in the project root. The app writes `storage/db.json` plus managed media under `storage/uploads/`, `storage/downloads/`, and `storage/converted/`. Back up this folder to back up your local metadata and media.

## Enable authorized direct file downloads

Remote downloads are deliberately disabled by default. Only enable hostnames you own or are authorized to download from.

1. Stop the running app.
2. Edit `.env` and set an exact host or a comma-separated list of exact hosts, for example:

   ```dotenv
   MEDIA_ALLOWED_HOSTS=media.your-domain.example,cdn.your-domain.example
   MEDIA_ALLOW_HTTP=false
   MAX_DOWNLOAD_MB=2048
   MAX_ACTIVE_DOWNLOADS=2
   ```

   Replace the example hostnames with real hostnames that you are entitled to use. Wildcards such as `*.your-domain.example` are supported, but exact hostnames are safer.
3. Restart `npm run dev`.
4. Paste a direct file URL, such as a permitted `.mp4`, `.webm`, `.mp3`, `.m4a`, `.wav`, or other supported direct-media file served by that host.

The inspector checks response headers and the downloaded response. It does not scrape a video page or claim that all formats/resolutions are available. On sources that expose a direct file only, the source file is downloaded as provided; no alternate quality is invented.

### Why the URL allowlist exists

The backend fetches URLs from a server process. Unrestricted URL fetching can create server-side request forgery (SSRF) risks. The allowlist and private/reserved IP checks reduce this risk. Keep the app on loopback and only allow trusted hosts. If deploying it beyond a personal computer, add stricter network egress controls and a production security review.

## Audio extraction

Audio extraction accepts supported audio/video uploads and uses FFprobe to confirm an audio stream exists before running FFmpeg. Outputs can be MP3, M4A, or WAV. Temporary input uploads are removed after conversion. Completed output becomes a normal item in My Library.

The source quality is the upper limit; conversion does not improve the original audio quality. Depending on the file's actual codec, browser playback support may vary.

## Optional MongoDB storage

The default is `DATA_DRIVER=file`; this is easiest for a single-user local install. To use MongoDB:

1. Start a local MongoDB server, or use `docker compose up -d mongodb` if Docker Compose is installed.
2. In `.env`, set:

   ```dotenv
   DATA_DRIVER=mongo
   MONGODB_URI=mongodb://127.0.0.1:27017/zeetube
   ```

3. Restart the app.

The Docker Compose file only starts MongoDB; it does not expose the app publicly or package Node dependencies.

## Useful commands

```bash
npm run dev       # frontend + API with reload
npm test          # built-in Node security helper tests
npm run check     # backend JavaScript syntax check
npm run build     # production frontend build
npm start         # production API; serves client-dist when NODE_ENV=production
```

For production-mode local serving after building:

```bash
NODE_ENV=production npm start
```

Set `HOST=127.0.0.1` in `.env` for local-only use. Do not change it to `0.0.0.0` unless you have configured authentication, access control, and network protections.

## QA and verification

See `QA_CHECKLIST.md` for checks run during packaging and the remaining end-to-end tests to run after dependencies are installed.

## Main API routes

- `GET /api/health` — backend, storage, FFmpeg, and configuration status.
- `GET /api/sources` — actual source support and current allowlist.
- `GET /api/search?q=...` — local library keyword search.
- `GET /api/catalog/config`, `/trending`, `/search`, `/videos/:id` — official YouTube discovery, search, and video metadata.
- `POST /api/media/inspect` — inspect a direct, allowlisted media URL.
- `POST /api/downloads` and `GET /api/downloads` — create/list direct downloads.
- `POST /api/downloads/:id/cancel` and `/retry` — cancel or retry.
- `GET /api/library`, `POST /api/library/upload`, `PATCH /api/library/:id`, `DELETE /api/library/:id` — media library.
- `GET /api/media/:id/stream` and `/download` — protected-by-local-app media playback/download endpoints.
- `POST /api/convert`, `GET /api/convert`, `GET /api/convert/:id`, `POST /api/convert/:id/cancel` — audio conversion jobs.
- `GET /api/playlists`, `POST /api/playlists`, `PATCH /api/playlists/:id`, `/api/playlists/:id/items` — playlists.
- `GET/POST/DELETE /api/history` — playback history.
- `GET/PATCH /api/settings` — user preferences.

## Limitations and production checklist

- The current configuration is local single-user mode. There is no registration/login system; never expose this version directly to the public internet.
- Direct remote downloads require `MEDIA_ALLOWED_HOSTS` and the source's permission. YouTube discovery and search require a configured server-side YouTube Data API key. YouTube playback uses the official embed player; YouTube watch-page downloads are not supported.
- Pause/resume is not exposed because arbitrary direct HTTP sources do not reliably support resumable range downloads. Cancel and retry are implemented.
- Quality selection is only meaningful when a trusted provider exposes multiple permitted downloadable assets. Generic direct file URLs do not provide that catalog.
- Large media transfers and FFmpeg conversions use local disk and CPU. Keep sufficient free space; choose reasonable upload/download limits.
- Some codecs will not play in every browser. Convert authorized media to a browser-friendly format when appropriate.
- Before multi-user or public deployment, add authentication, account-scoped storage and jobs, CSRF protections as appropriate, strict per-user quotas, structured logs, request and process isolation, backups, and security monitoring.

## Troubleshooting

**The UI says backend offline:** start `npm run dev` from the project root and check port 5050.

**`npm install` cannot resolve packages:** verify internet/DNS access to the npm registry, then retry. This ZIP includes source code and manifests, not `node_modules`.

**Audio extraction is unavailable:** install `ffmpeg` and ensure both `ffmpeg` and `ffprobe` are on the server PATH, then restart the backend.

**URL inspection says host is not enabled:** add the exact hostname to `MEDIA_ALLOWED_HOSTS` in `.env` and restart. Avoid enabling domains you do not control or have permission to use.

**Downloaded file is rejected:** only direct audio/video media files with supported types/extensions are accepted. A web page, manifest, HTML error response, or redirect to a non-allowed host is rejected.

**Media is in the library but playback fails:** the browser may not support the file's codec/container. Try another browser-compatible file or use the audio conversion tool if the source contains audio.


## YouTube discovery setup

Live Home feed and remote video search use the official YouTube Data API v3. Create a Google Cloud project, enable **YouTube Data API v3**, create an API key, and add it to the server environment as `YOUTUBE_API_KEY`. Set `YOUTUBE_REGION=PK` for Pakistan discovery (the default). Keep the key server-side; never add it to client code or a `VITE_` variable. Restrict the key to the YouTube Data API and apply suitable API-key restrictions in Google Cloud Console.

The app uses `search.list` with strict SafeSearch and embeddable-video filtering. Video playback uses YouTube's official privacy-enhanced iframe player. ZeeTube does not download YouTube videos or extract their audio. Downloads remain limited to local media and authorized direct media-file URLs from explicitly allowed hosts. API quota limits apply; the app caches catalog responses briefly to reduce repeated requests.

In GitHub Codespaces, add `YOUTUBE_API_KEY` as a Codespaces repository or environment secret, or set it in the server-side `.env` file for private testing. Restart the app after changing environment variables. Do not commit a real key to Git.

## ZeeTube Plus status

The ZeeTube Plus page is currently a non-transactional membership preview. This build has no advertising network, sign-in/accounts, cloud sync, or payment processor, so it does not charge users or claim an active paid subscription. These services must be designed, secured, integrated, and tested before offering subscriptions.
