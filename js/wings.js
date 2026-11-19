import * as THREE from 'three';

// Fold-out wings for flying in World Drive. Folded, they stand on edge along the car's sides like short fins; flick flight mode on and
// they swing out to full span (with nav lights on the tips: red on the left, green on the right, a white strobe).
// Styles: jet (swept, with little engine pods), glider (long and straight), delta (wide triangle), bat (scalloped).
export const WING_STYLES = [['jet', 'Jet'], ['glider', 'Glider'], ['delta', 'Delta'], ['bat', 'Bat']];
export const WING_COLORS = [['paint', 'Car colour', null], ['white', 'White', '#eef1f4'], ['carbon', 'Carbon', '#24272c'], ['red', 'Red', '#d23a32'], ['gold', 'Gold', '#d4a63a'], ['chrome', 'Chrome', '#cfd6dc']];

function wingShape(style, span) {
  const s = new THREE.Shape(), L = span;
  if (style === 'glider') { s.moveTo(0, 0.55); s.lineTo(L, 0.32); s.lineTo(L + 0.1, 0.1); s.lineTo(L, -0.12); s.lineTo(0, -0.55); }
  else if (style === 'delta') { s.moveTo(0, 1.1); s.lineTo(L * 0.85, -0.65); s.lineTo(L * 0.92, -0.85); s.lineTo(0, -0.85); }
  else if (style === 'bat') { s.moveTo(0, 0.7); s.lineTo(L * 0.5, 0.5); s.lineTo(L, 0.75); s.lineTo(L * 0.92, -0.2); s.quadraticCurveTo(L * 0.78, -0.05, L * 0.66, -0.55); s.quadraticCurveTo(L * 0.5, -0.3, L * 0.36, -0.7); s.quadraticCurveTo(L * 0.2, -0.45, 0, -0.75); }
  else { s.moveTo(0, 0.75); s.lineTo(L, -0.55); s.lineTo(L, -0.95); s.lineTo(0, -0.6); } // jet: swept back
  s.closePath(); return s;
}
// one wing pointing +x from its hinge, flat in the xz plane (+z = forward)
function wingGeo(style, span) {
  const g = new THREE.ExtrudeGeometry(wingShape(style, span), { depth: 0.07, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 1, curveSegments: 6 });
  g.rotateX(Math.PI / 2); g.translate(0, 0.035, 0); g.computeVertexNormals(); return g;
}
export class Wings {
  constructor() { this.cfg = null; this.key = ''; this.car = null; this.group = null; this.open = 0; this.t = 0; }
  // cfg: { style, color, paint } or null for none
  set(cfg) { const k = cfg ? JSON.stringify(cfg) : ''; if (k === this.key) return; this.key = k; this.cfg = cfg; this.car = null; }
  remove() { if (this.group && this.group.parent) this.group.parent.remove(this.group); if (this.group) this.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material && !o.material.userData.keep) o.material.dispose(); } }); this.group = null; }
  attach(car) {
    this.remove(); this.car = car; if (!this.cfg) return;
    const m = car.mesh; m.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(m.matrixWorld).invert(), bb = new THREE.Box3(), tmp = new THREE.Box3(), rel = new THREE.Matrix4();
    const skip = o => { for (let q = o; q && q !== m; q = q.parent) if (q.name === 'cockpit' || q.name === 'wings' || q.userData.cockpit || q === m.userData.weaponGroup) return true; return false; };
    m.traverseVisible(o => { if (!o.isMesh || !o.geometry || o.isInstancedMesh || o.material?.isMeshBasicMaterial || o.material?.transparent || skip(o)) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)); bb.union(tmp); });
    if (bb.isEmpty() || bb.max.x - bb.min.x > 6) bb.set(new THREE.Vector3(-0.9, 0, -2.2), new THREE.Vector3(0.9, 1.4, 2.2));
    const W = Math.min(1.2, (bb.max.x - bb.min.x) / 2), H = bb.max.y - bb.min.y, L = bb.max.z - bb.min.z, cz = (bb.min.z + bb.max.z) / 2;
    const span = Math.max(2.2, Math.min(3.6, L * 0.72)), style = this.cfg.style || 'jet';
    const col = WING_COLORS.find(c => c[0] === this.cfg.color)?.[2] || this.cfg.paint || '#d23a32', chrome = this.cfg.color === 'chrome' || this.cfg.color === 'gold';
    const mat = new THREE.MeshStandardMaterial({ color: col, metalness: chrome ? 1 : 0.35, roughness: chrome ? 0.18 : 0.38, side: THREE.DoubleSide });
    const dark = new THREE.MeshStandardMaterial({ color: '#1b1d22', metalness: 0.7, roughness: 0.4 });
    const g = new THREE.Group(); g.name = 'wings'; this.sides = [];
    for (const sd of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(sd * (W + 0.03), bb.min.y + H * 0.42, cz + 0.1); g.add(hinge);
      const w = new THREE.Mesh(wingGeo(style, span), mat); w.castShadow = true; if (sd < 0) w.scale.x = -1; hinge.add(w);
      const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 10), dark); knuckle.rotation.x = Math.PI / 2; hinge.add(knuckle);
      const tipZ = style === 'jet' ? -0.75 : style === 'delta' ? -0.75 : style === 'bat' ? 0.3 : 0.1, tipX = sd * (style === 'delta' ? span * 0.88 : span);
      const nav = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: sd < 0 ? '#ff2a2a' : '#2aff6a', toneMapped: false })); nav.position.set(tipX, 0.06, tipZ); hinge.add(nav);
      const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })); strobe.position.set(tipX, 0.06, tipZ - 0.15); hinge.add(strobe);
      if (style === 'jet') { const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.8, 12), dark); pod.rotation.x = Math.PI / 2; pod.position.set(sd * span * 0.45, -0.12, -0.05); hinge.add(pod); const glow = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), new THREE.MeshBasicMaterial({ color: '#7fd8ff', toneMapped: false, transparent: true, opacity: 0.8 })); glow.position.set(sd * span * 0.45, -0.12, -0.46); glow.rotation.y = Math.PI; hinge.add(glow); }
      this.sides.push({ hinge, sd, nav, strobe });
    }
    m.add(g); this.group = g; this.apply();
  }
  // folded: shrunk to fins standing on edge along the car's sides; open: rolled flat, swung out to full span, a touch of dihedral
  apply() {
    if (!this.group) return; const k = this.open, e = k * k * (3 - 2 * k);
    const r = 1 - e; for (const s of this.sides) { s.hinge.rotation.set(-Math.PI / 2 * r, s.sd * r * 1.5, s.sd * 0.06 * e, 'YXZ'); s.hinge.scale.setScalar(0.45 + 0.55 * e); s.nav.visible = e > 0.9; s.strobe.visible = e > 0.9 && (this.t % 1.2) < 0.08; }
  }
  update(dt, car, open) {
    this.t += dt;
    if (!this.cfg) { if (this.group) this.remove(); this.car = car; return; }
    if (this.car !== car || !this.group || this.group.parent !== car.mesh) this.attach(car);
    const want = open ? 1 : 0, before = this.open; this.open += Math.sign(want - this.open) * Math.min(Math.abs(want - this.open), dt / 0.9);
    if (this.open !== before || this.open > 0.9) this.apply();
    return this.open;
  }
}
