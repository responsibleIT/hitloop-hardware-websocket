class SceneManager {
    constructor(deviceManager) {
        this.deviceManager = deviceManager;
        this.scenes = new Map(); // key -> Scene instance
        this.currentKey = null;
    }

    addScene(key, sceneInstance) {
        this.scenes.set(key, sceneInstance);
    }

    switchTo(key) {
        const next = this.scenes.get(key);
        document.title = "Hitloop " + key;
        if (!next) return false;
        this.currentKey = key;
        if (typeof next.setup === 'function') next.setup();
        return true;
    }

    draw() {
        if (!this.currentKey) return;
        const scene = this.scenes.get(this.currentKey);
        if (scene && typeof scene.draw === 'function') {
            scene.draw();
            // Draw debug text if enabled
            if (scene.showDebugText && typeof scene.drawDebugText === 'function') {
                scene.drawDebugText();
            }
        }
    }

    keyPressed() {
        if (!this.currentKey) return;
        const scene = this.scenes.get(this.currentKey);
        if (scene && typeof scene.keyPressed === 'function') {
            scene.keyPressed();
        }
    }

    getOrderedKeys() {
        return Array.from(this.scenes.keys());
    }

    getCurrentIndex() {
        const keys = this.getOrderedKeys();
        if (!this.currentKey) return -1;
        return keys.indexOf(this.currentKey);
    }

    nextScene() {
        const keys = this.getOrderedKeys();
        if (keys.length === 0) return false;
        const idx = this.getCurrentIndex();
        if (idx < 0) {
            return this.switchTo(keys[0]);
        }
        if (idx >= keys.length - 1) {
            return false;
        }
        return this.switchTo(keys[idx + 1]);
    }

    previousScene() {
        const keys = this.getOrderedKeys();
        if (keys.length === 0) return false;
        const idx = this.getCurrentIndex();
        if (idx <= 0) {
            return false;
        }
        return this.switchTo(keys[idx - 1]);
    }
}



