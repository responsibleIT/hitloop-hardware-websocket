# Client Hub

Single Flask application that serves all client UIs under `/apps/<name>/` from `app/static/apps/<name>/`.

## Layout
- `app/app.py`: Flask app + routes (`/`, `/api/apps`, `/config.js`, `/apps/<name>/...`).
- `app/static/vendor/js`: shared libs (p5, HitloopDevice*, p5.sound).
- `app/static/apps/<name>`: each client’s self-contained HTML/CSS/JS.
- `app/templates/landing.html`: landing page listing detected apps.

## Running locally
```bash
docker compose up client_hub
```
or run Flask directly:
```bash
cd client-hub/app
FLASK_APP=app.app flask run --host 0.0.0.0 --port 5000
```

Environment variables:
- `WS_DEFAULT_URL` (default `ws://localhost:5003/`) → injected via `/config.js`.
- `CDN_BASE_URL` (default `/static/vendor`) → emitted by `/config.js` for future use.
- `DEFAULT_APP` → when set to an app folder name, `/` redirects to it.

## Add / remove apps
1. Create a folder in `app/static/apps/<your-app>/` with an `index.html` plus any JS/CSS/assets.
2. Reference local assets relatively (e.g., `./client.js`, `./style.css`). Shared libs available at `/static/vendor/js/...`.
3. Restart the container; `/api/apps` and the landing page will pick up the new folder automatically.
4. Remove an app by deleting its folder and restarting.

## Notes
- `/config.js` exposes `window.APP_CONFIG` with `wsDefaultUrl`, `cdnBaseUrl`, and `appsBaseUrl`.
- Static routes guard against path traversal; only files under `app/static/apps` are served for `/apps/<name>/...`.
