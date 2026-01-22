class Scene {
    constructor(deviceManager) {
        this.deviceManager = deviceManager;
        this.showDebugText = false;
    }

    setup() {}

    draw() {}

    drawDebugText() {
        // Override this method in subclasses to draw debug information
    }

    toggleDebugText() {
        this.showDebugText = !this.showDebugText;
    }

    keyPressed() {
        if (key === 'd' || key === 'D') {
            this.toggleDebugText();
        }
    }
}



