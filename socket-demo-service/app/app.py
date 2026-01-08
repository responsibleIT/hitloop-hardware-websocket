import os
from flask import Flask, abort, send_from_directory

# Path to the original socket-demo assets mounted into the container
SOCKET_DEMO_PATH = os.environ.get("SOCKET_DEMO_PATH", "/socket-demo")

if not os.path.isdir(SOCKET_DEMO_PATH):
    raise FileNotFoundError(f"Socket demo directory not found at {SOCKET_DEMO_PATH}")

app = Flask(__name__, static_folder=SOCKET_DEMO_PATH, static_url_path="")


@app.route("/")
def index():
    """Serve the main index.html from the socket-demo folder."""
    index_file = "index.html"
    if not os.path.isfile(os.path.join(app.static_folder, index_file)):
        abort(404)
    return send_from_directory(app.static_folder, index_file)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))

