class WanderingAttractorsScene extends Scene {
	constructor(deviceManager) {
		super(deviceManager);
		this.particles = new Map(); // deviceId -> { x, y, vx, vy }
		this.leftAttractor = { x: 0, y: 0 };
		this.rightAttractor = { x: 0, y: 0 };
		this.params = {
			maxSpeed: 2.0,
			maxForce: 0.08,
			wanderJitter: 0.05,
			baseAttraction: 0.16,
			edgePadding: 40
		};
	}

	setup() {
		const pad = this.params.edgePadding;
		this.leftAttractor.x = pad;
		this.leftAttractor.y = height / 2;
		this.rightAttractor.x = width - pad;
		this.rightAttractor.y = height / 2;
	}

	draw() {
		background(16);
		this.#updateAttractors();
		this.#updateParticles();
		this.#drawAttractors();
		this.#drawParticles();
	}

	#updateAttractors() {
		// Keep attractors aligned if canvas resized
		const pad = this.params.edgePadding;
		this.leftAttractor.x = pad;
		this.leftAttractor.y = height / 2;
		this.rightAttractor.x = width - pad;
		this.rightAttractor.y = height / 2;
	}

	#getOrCreateParticle(id) {
		let p = this.particles.get(id);
		if (!p) {
			p = {
				x: random(60, width - 60),
				y: random(60, height - 60),
				vx: random(-1, 1),
				vy: random(-1, 1)
			};
			this.particles.set(id, p);
		}
		return p;
	}

	#limitVector(obj, max) {
		const m2 = obj.vx * obj.vx + obj.vy * obj.vy;
		if (m2 > max * max) {
			const m = sqrt(m2);
			obj.vx = (obj.vx / m) * max;
			obj.vy = (obj.vy / m) * max;
		}
	}

	#applyForce(p, fx, fy) {
		p.vx += fx;
		p.vy += fy;
	}

	#updateParticles() {
		const devices = Array.from(this.deviceManager.getAllDevices().values());
		const eps = 0.0001;
		for (const device of devices) {
			const d = device.getSensorData();
			const id = d.id;
			const p = this.#getOrCreateParticle(id);

			// Wander: small random steering
			const jitter = this.params.wanderJitter;
			this.#applyForce(p, random(-jitter, jitter), random(-jitter, jitter));

			// Attraction weights based on NE/NW signal strength (use inverse of distance)
			const invNW = 1.0 / max(eps, d.dNW || 0);
			const invNE = 1.0 / max(eps, d.dNE || 0);
			const sumInv = invNW + invNE + eps;
			const wLeft = invNW / sumInv;  // left attractor corresponds to NW beacon
			const wRight = invNE / sumInv; // right attractor corresponds to NE beacon

			// Force toward left attractor
			let lx = this.leftAttractor.x - p.x;
			let ly = this.leftAttractor.y - p.y;
			let lm = sqrt(lx * lx + ly * ly) || 1;
			lx /= lm; ly /= lm;
			const leftStrength = this.params.baseAttraction * wLeft;
			this.#applyForce(p, lx * leftStrength, ly * leftStrength);

			// Force toward right attractor
			let rx = this.rightAttractor.x - p.x;
			let ry = this.rightAttractor.y - p.y;
			let rm = sqrt(rx * rx + ry * ry) || 1;
			rx /= rm; ry /= rm;
			const rightStrength = this.params.baseAttraction * wRight;
			this.#applyForce(p, rx * rightStrength, ry * rightStrength);

			// Limit velocity and update position
			this.#limitVector(p, this.params.maxSpeed);
			p.x += p.vx;
			p.y += p.vy;

			// Gentle steering limit (avoid sudden spikes)
			this.#limitVector(p, this.params.maxSpeed);

			// Wrap around edges
			if (p.x < -10) p.x = width + 10;
			if (p.x > width + 10) p.x = -10;
			if (p.y < -10) p.y = height + 10;
			if (p.y > height + 10) p.y = -10;
		}

		// Remove particles for devices no longer present
		const aliveIds = new Set(devices.map(dev => dev.getSensorData().id));
		for (const key of this.particles.keys()) {
			if (!aliveIds.has(key)) this.particles.delete(key);
		}
	}

	#drawAttractors() {
		noStroke();
		// Left (NW)
		fill(80, 180, 255);
		circle(this.leftAttractor.x, this.leftAttractor.y, 14);
		// Right (NE)
		fill(255, 150, 80);
		circle(this.rightAttractor.x, this.rightAttractor.y, 14);

		// Labels
		fill(220);
		textAlign(CENTER);
		text('NW', this.leftAttractor.x, this.leftAttractor.y - 12);
		text('NE', this.rightAttractor.x, this.rightAttractor.y - 12);
		textAlign(LEFT);
	}

	#drawParticles() {
		noStroke();
		for (const [id, p] of this.particles.entries()) {
			// Color per-id for visual distinction
			const hueSeed = this.#hashToHue(id);
			fill(hueSeed, 180, 220, 220);
			// If color mode is RGB, clamp values; if HSB is desired, users can switch externally
			circle(p.x, p.y, 12);
		}

	}

	#hashToHue(str) {
		let h = 0;
		for (let i = 0; i < String(str).length; i++) {
			h = (h * 31 + String(str).charCodeAt(i)) >>> 0;
		}
		return (h % 200) + 30; // 30..229 range for visible colors in RGB fill
	}
	
	drawDebugText() {
		blendMode(BLEND);
		fill(255);
		textAlign(LEFT, TOP);
		textSize(16);
		text(`Devices: ${this.particles.size}`, 10, 20);
		text('Wandering circles; attraction left(NW)/right(NE) by signal', 10, height - 30);
		text('Press D to toggle debug info', 10, height - 10);
	}
}




