import json
import os
from pathlib import Path
from flask import Flask, abort, jsonify, redirect, render_template, Response, send_from_directory, url_for


BASE_DIR = Path(__file__).parent
STATIC_APPS_DIR = (BASE_DIR / "static" / "apps").resolve()


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _list_apps():
    if not STATIC_APPS_DIR.exists():
        return []
    return sorted(
        p.name
        for p in STATIC_APPS_DIR.iterdir()
        if p.is_dir() and (p / "index.html").is_file()
    )


def create_app() -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")

    @app.route("/")
    def landing():
        apps = _list_apps()
        default_app = os.environ.get("DEFAULT_APP")
        if default_app and default_app in apps:
            return redirect(url_for("serve_app_index", app_name=default_app))
        return render_template("landing.html", apps=apps)

    @app.route("/health")
    def health():
        return {"status": "ok", "apps": _list_apps()}

    @app.route("/api/apps")
    def api_apps():
        return jsonify({"apps": _list_apps()})

    @app.route("/config.js")
    def config_js():
        cfg = {
            "wsDefaultUrl": os.environ.get("WS_DEFAULT_URL", "ws://localhost:5003/"),
            "cdnBaseUrl": os.environ.get("CDN_BASE_URL", "/static/vendor"),
            "appsBaseUrl": "/apps",
        }
        body = f"window.APP_CONFIG = {json.dumps(cfg)};"
        return Response(body, mimetype="application/javascript")

    @app.route("/apps/<app_name>/")
    def serve_app_index(app_name: str):
        base = (STATIC_APPS_DIR / app_name).resolve()
        if not _is_within(base, STATIC_APPS_DIR):
            abort(404)
        index_path = base / "index.html"
        if not index_path.is_file():
            abort(404)
        return send_from_directory(index_path.parent, index_path.name)

    @app.route("/apps/<app_name>/<path:filename>")
    def serve_app_asset(app_name: str, filename: str):
        base = (STATIC_APPS_DIR / app_name).resolve()
        if not _is_within(base, STATIC_APPS_DIR):
            abort(404)

        target = (base / filename).resolve()
        if not target.is_file() or not _is_within(target, base):
            abort(404)
        return send_from_directory(base, target.relative_to(base).as_posix())

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
