// Global configuration and shared state
window.cfg = {
	canvas: { width: 1024, height: 768 },
	websocketUrl: (typeof DEFAULT_WS_URL !== 'undefined' && DEFAULT_WS_URL) ? DEFAULT_WS_URL : 'ws://localhost:5003',
	device: {
		cubeSize: 40,
		heightY: 20,
		axisLen: 50,
		axisLen: 50,
	},
	sim: {
		minDevices: 1,
		maxDevices: 50,
		defaultDevices: 10,
		minHz: 10,
		maxHz: 50,
		defaultHz: 25,
		seed: 1337,
		rotationMode: 'random', // 'off' | 'constant' | 'random'
		angularMax: {
			rotZ: 1.2,
			rotX: 1.2,
			rotY: 1.2,
		},
			// Tap simulation parameters
			tap: {
				ratePerSecond: 0.2, // average taps per second per device
				durationMs: 200 // how long tap stays active
			},
	},
	world: {
		gridWidth: 800,
		gridHeight: 600,
		gridStep: 50,
		beaconRadius: 10,
		maxSpeed: 120,
	},
	flocking: {
		alignmentWeight: 0.8,
		cohesionWeight: 0.6,
		separationWeight: 1.2,
		alignmentRadius: 160,
		cohesionRadius: 160,
		separationRadius: 80,
		separationDistance: 40,
		maxForce: 80
	},
	colors: {
		bg: 10
	}
};

