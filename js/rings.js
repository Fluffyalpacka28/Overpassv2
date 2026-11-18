import * as THREE from 'three';

// Glowing rings floating in the sky while flying cars is on. Fly through one for a big temporary speed boost.
// Rings are spread around you (some in short chains you can thread), and respawn further on once you're past or collect them.
const COUNT = 18, R = 10, NEAR = 260, FAR = 1500, DROP = 1900;
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function glowDisc() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 20, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.72, 'rgba(255,255,255,0.05)'); g.addColorStop(0.9, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export class SkyRings {
  constructor(scene) {
    seed = (Date.now() % 100000) + 7;
    this.g = new THREE.Group(); this.g.visible = false; scene.add(this.g); this.rings = []; this.t = 0; this.p0 = null; this.combo = 0; this.comboT = 0;
    this.torus = new THREE.TorusGeometry(R, 0.55, 10, 48); this.halo = new THREE.TorusGeometry(R, 1.6, 8, 40); this.disc = new THREE.CircleGeometry(R * 1.05, 40); this.discTex = glowDisc();
    for (let i = 0; i < COUNT; i++) {
      const core = new THREE.MeshBasicMaterial({ color: '#ffd23a', toneMapped: false, fog: false }), haloM = new THREE.MeshBasicMaterial({ color: '#ffb000', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
      const discM = new THREE.MeshBasicMaterial({ map: this.discTex, color: '#fff2a0', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
      const o = new THREE.Group(), a = new THREE.Mesh(this.torus, core), b = new THREE.Mesh(this.halo, haloM), d = new THREE.Mesh(this.disc, discM); o.add(a, b, d);
      this.g.add(o); this.rings.push({ o, a, b, d, core, haloM, discM, n: new THREE.Vector3(0, 0, 1), live: false, got: 0, ph: rnd() * 6 });
    }
  }
  place(ring, x, y, z, yaw) {
    ring.o.position.set(x, y, z); ring.o.rotation.set(0, yaw, 0); ring.n.set(Math.sin(yaw), 0, Math.cos(yaw)); ring.live = true; ring.got = 0;
    ring.o.scale.setScalar(1); ring.o.visible = true; ring.core.color.set('#ffd23a'); ring.haloM.opacity = 0.35; ring.discM.opacity = 0.7;
  }
  // put a ring (or a short chain of them) somewhere ahead-ish of the player
  spawn(p, heightAt, ring) {
    const ang = (p.yaw || 0) + (rnd() - 0.5) * 2.6, dist = NEAR + rnd() * (FAR - NEAR), x = p.x + Math.sin(ang) * dist, z = p.z + Math.cos(ang) * dist;
    const y = Math.max((p.y || 0) * 0.6, heightAt(x, z)) + 40 + rnd() * 170, face = Math.atan2(p.x - x, p.z - z) + (rnd() - 0.5) * 0.9;
    this.place(ring, x, y, z, face);
    if (rnd() < 0.35) { // a chain: the next few free rings line up behind this one
      const dir = face + Math.PI, steps = 2 + Math.floor(rnd() * 3); let k = 0;
      for (const r2 of this.rings) { if (k >= steps) break; if (r2.live || r2 === ring) continue; k++; const cx = x + Math.sin(dir) * 85 * k, cz = z + Math.cos(dir) * 85 * k; this.place(r2, cx, y + (rnd() - 0.5) * 30 * k, cz, face + (rnd() - 0.5) * 0.3); }
    }
  }
  hide() { this.g.visible = false; this.p0 = null; }
  // on: flying cars enabled in World Drive. onHit(combo) is called when the player threads a ring.
  update(dt, p, on, heightAt, onHit) {
    if (!on) { if (this.g.visible) { this.g.visible = false; for (const r of this.rings) r.live = false; } this.p0 = null; return; }
    this.g.visible = true; this.t += dt; if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.combo = 0;
    const px = p.x, py = (p.y || 0) + 0.6, pz = p.z;
    for (const r of this.rings) {
      if (!r.live) { this.spawn(p, heightAt, r); continue; }
      if (r.got > 0) { // collected: burst outwards and fade, then move on
        r.got += dt; const k = r.got / 0.7; r.o.scale.setScalar(1 + k * 0.8); r.haloM.opacity = 0.35 * (1 - k); r.discM.opacity = 0.7 * (1 - k); r.core.color.setRGB(1, 1, 1).multiplyScalar(Math.max(0, 1 - k) * 1.5);
        if (k >= 1) { r.live = false; r.o.visible = false; } continue;
      }
      const c = r.o.position, dx = c.x - px, dz = c.z - pz;
      if (dx * dx + dz * dz > DROP * DROP) { r.live = false; continue; }
      // gentle life: spin of the glow, pulse
      const pu = 0.5 + 0.5 * Math.sin(this.t * 3 + r.ph); r.haloM.opacity = 0.22 + 0.22 * pu; r.d.rotation.z += dt * 0.6; r.a.scale.setScalar(1 + 0.02 * pu);
      // did the player's path this frame cross the ring's disc?
      if (this.p0) {
        const n = r.n, d0 = (this.p0.x - c.x) * n.x + (this.p0.y - c.y) * n.y + (this.p0.z - c.z) * n.z, d1 = (px - c.x) * n.x + (py - c.y) * n.y + (pz - c.z) * n.z;
        if ((d0 > 0) !== (d1 > 0)) {
          const t = d0 / (d0 - d1), hx = this.p0.x + (px - this.p0.x) * t - c.x, hy = this.p0.y + (py - this.p0.y) * t - c.y, hz = this.p0.z + (pz - this.p0.z) * t - c.z;
          if (hx * hx + hy * hy + hz * hz < (R - 0.4) * (R - 0.4)) { r.got = 0.0001; this.combo++; this.comboT = 4; onHit && onHit(this.combo); }
        }
      }
    }
    if (!this.p0) this.p0 = new THREE.Vector3(); this.p0.set(px, py, pz);
  }
}
