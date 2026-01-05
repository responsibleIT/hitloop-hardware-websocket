// Create device manager instance
const deviceManager = new HitloopDeviceManager('ws://feib.nl:5003');
const sceneManager = new SceneManager(deviceManager);
let fullScreenMode = false;
let grouploopOutput = null;
// Make grouploopOutput globally accessible
window.grouploopOutput = null;

// Initialize WebMidi and connect to "grouploop" device
WebMidi.enable()
    .then(() => {
        console.log('WebMidi enabled successfully');
        
        // Find and connect to the "grouploop" output device
        grouploopOutput = WebMidi.getOutputByName("grouploop");
        
        if (grouploopOutput) {
            console.log('Connected to grouploop MIDI device:', grouploopOutput.name);
            // Make it globally accessible
            window.grouploopOutput = grouploopOutput;
        } else {
            console.warn('grouploop MIDI device not found. Available devices:');
            WebMidi.outputs.forEach(output => {
                console.log('  -', output.name);
            });
        }
    })
    .catch(err => {
        console.error('WebMidi could not be enabled:', err);
    });

// Register example game states
// sceneManager.addScene('intro', new Intro(deviceManager));
// sceneManager.addScene('greenBuilding', new GreenBuilding(deviceManager));
// sceneManager.addScene('city', new City(deviceManager));
// sceneManager.addScene('greenLights', new GreenLights(deviceManager));
// sceneManager.addScene('heatMap', new HeatMap(deviceManager));
sceneManager.addScene('controlTheBall', new ControlTheBall(deviceManager));
// sceneManager.addScene('music', new MusicVisualizer(deviceManager));
// sceneManager.addScene('rainyDaySingle', new RainyDaySingle(deviceManager));
// sceneManager.addScene('particles', new Particles(deviceManager));
// sceneManager.addScene('twoPlanets', new TwoPlanets(deviceManager));
// sceneManager.addScene('threePlanets', new ThreePlanets(deviceManager));
// sceneManager.addScene('race', new Race(deviceManager));
// sceneManager.addScene('reveal', new GroupReveal(deviceManager));
// sceneManager.addScene('hats', new HatsScene(deviceManager));
// sceneManager.addScene('midiController', new MidiControllerScene(deviceManager));
// sceneManager.addScene('flower', new Flower(deviceManager));
// sceneManager.addScene('ink', new Ink(deviceManager));
// sceneManager.addScene('inkColor', new InkColor(deviceManager));
// sceneManager.addScene('paintRace', new PaintRace(deviceManager));
sceneManager.addScene('fountain', new Fountain(deviceManager));
// sceneManager.addScene('ink', new Ink(deviceManager));

let uiFont;

function preload() {
    // Load a web-safe TTF so WEBGL text rendering is enabled
    //uiFont = loadFont('https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf');
    uiFont = loadFont('https://fonts.gstatic.com/s/momotrustdisplay/v2/WWXPlieNYgyPZLyBUuEkKZFhFHyjqb1un2xNNgNa1A.ttf');
}

function setup() {
    createCanvas(windowWidth, windowHeight);
    if (uiFont) {
        textFont(uiFont);
    }
    textSize(16);
    // Connect to WebSocket server
    deviceManager.connect();
    // Default state
    sceneManager.switchTo('controlTheBall');
}

function draw() {
    sceneManager.draw();
    if (window.Instructions) window.Instructions.draw();
}

function keyPressed() {
    if (keyCode === RIGHT_ARROW) {
        sceneManager.nextScene();
    } else if (keyCode === LEFT_ARROW) {
        sceneManager.previousScene();
    } else if (key === 'f') {
        fullscreen(fullScreenMode);
        fullScreenMode = !fullScreenMode;
        resizeCanvas(windowWidth, windowHeight);

    } else {
        // Pass other key events to the current scene
        sceneManager.keyPressed();
    }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}