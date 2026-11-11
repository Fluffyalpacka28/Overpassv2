// ripples.js
import * as THREE from 'three';

export class RippleSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} [options]
     * @param {number} [options.waterY=0]          Water surface height
     * @param {number} [options.spawnInterval=0.2] Seconds between ripple spawns
     * @param {number} [options.lifetime=1.5]      Seconds a ripple lasts
     * @param {number} [options.maxScale=3.5]      Final ring size multiplier
     * @param {number} [options.wheelTrack=0.9]    Distance between left/right ripples
     * @param {number} [options.rearOffset=1.8]    Distance behind car center
     * @param {number} [options.maxRipples=80]     Pool cap
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        this.waterY = options.waterY ?? 0;
        this.spawnInterval = options.spawnInterval ?? 0.2;
        this.lifetime = options.lifetime ?? 1.5;
        this.maxScale = options.maxScale ?? 3.5;
        this.wheelTrack = options.wheelTrack ?? 0.9;
        this.rearOffset = options.rearOffset ?? 1.8;
        this.maxRipples = options.maxRipples ?? 80;

        this.timer = 0;
        this.ripples = [];
        this.geometry = new THREE.PlaneGeometry(1, 1);
        this.texture = this._createRingTexture();
    }

    _createRingTexture() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.30,
                                              size / 2, size / 2, size * 0.5);
        grad.addColorStop(0.0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
        grad.addColorStop(0.8, 'rgba(255,255,255,0.4)');
        grad.addColorStop(1.0, 'rgba(255,255,255,0)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    _spawn(x, z, heading) {
        // Remove oldest ripple if the pool is full
        if (this.ripples.length >= this.maxRipples) {
            this._remove(this.ripples[0]);
        }

        const material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(this.geometry, material);
        mesh.rotation.x = -Math.PI / 2;   // lay flat on the water
        mesh.position.set(x, this.waterY + 0.02, z); // slight lift avoids z-fighting
        mesh.renderOrder = 1;
        this.scene.add(mesh);

        this.ripples.push({ mesh, material, age: 0, baseSize: 1.2 });
    }

    _remove(ripple) {
        this.scene.remove(ripple.mesh);
        ripple.material.dispose();
        this.ripples.splice(this.ripples.indexOf(ripple), 1);
    }

    /**
     * Call once per frame.
     * @param {number} dt            Delta time in seconds
     * @param {THREE.Vector3} pos    Car world position
     * @param {number} heading       Car yaw in radians (forward = sin(h), cos(h) on XZ)
     * @param {number} speed         Car speed (units/sec)
     * @param {boolean} onWater      Whether the car's wheels are over water
     */
    update(dt, pos, heading, speed, onWater) {
        // Spawn logic
        if (onWater && speed > 1.0) {
            this.timer += dt;
            if (this.timer >= this.spawnInterval) {
                this.timer = 0;

                // Backward and sideways directions on the XZ plane
                const fwdX = Math.sin(heading), fwdZ = Math.cos(heading);
                const rightX = Math.cos(heading), rightZ = -Math.sin(heading);

                // Rear center point
                const rx = pos.x - fwdX * this.rearOffset;
                const rz = pos.z - fwdZ * this.rearOffset;

                // Two ripples, one per rear wheel
                const half = this.wheelTrack / 2;
                this._spawn(rx + rightX * half, rz + rightZ * half, heading);
                this._spawn(rx - rightX * half, rz - rightZ * half, heading);
            }
        } else {
            this.timer = this.spawnInterval; // spawn immediately on re-entry
        }

        // Update existing ripples (iterate over a copy because we remove items)
        for (const r of [...this.ripples]) {
            r.age += dt;
            const t = r.age / this.lifetime;

            if (t >= 1) {
                this._remove(r);
                continue;
            }

            const scale = r.baseSize * (1 + t * this.maxScale);
            r.mesh.scale.set(scale, scale, 1);
            r.material.opacity = 0.6 * (1 - t) * (1 - t); // ease-out fade
        }
    }

    dispose() {
        for (const r of [...this.ripples]) this._remove(r);
        this.geometry.dispose();
        this.texture.dispose();
    }
}
