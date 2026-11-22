import * as THREE from 'three';

// Live reflections for car paint, glass and chrome: a small cube camera rides just above the player's car and redraws one face of
// the world around it per frame (a full refresh every 6 frames, sub-second), so cars reflect the actual sky, buildings, trees,
// street lights and sunsets instead of a fixed studio map. three turns the cube into blurred versions for rough materials (PMREM)
// whenever a full set of faces is done. Only used on 'Pretty' graphics, never in VR.
export class EnvProbe {
  constructor(renderer, size = 128) {
    this.r = renderer;
    this.rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter });
    this.cam = new THREE.CubeCamera(0.5, 320, this.rt);
    this.face = 0; this.ready = false; this.every = 1; this.tick = 0;
  }
  get texture() { return this.rt.texture; }
  // pos: where to look from; hide: things to leave out (the player's own car)
  update(scene, pos, hide = []) {
    if ((this.tick = (this.tick + 1) % this.every) !== 0) return;
    const r = this.r, prevRT = r.getRenderTarget(), prevXr = r.xr.enabled, cams = this.cam.children, f = this.face;
    this.cam.position.copy(pos); this.cam.updateMatrixWorld(true);
    const vis = hide.map(o => o && o.visible); hide.forEach(o => { if (o) o.visible = false; });
    r.xr.enabled = false;
    r.setRenderTarget(this.rt, f); r.render(scene, cams[f]);
    r.xr.enabled = prevXr; r.setRenderTarget(prevRT);
    hide.forEach((o, i) => { if (o) o.visible = vis[i]; });
    this.face = (f + 1) % 6;
    if (this.face === 0) { this.rt.texture.needsPMREMUpdate = true; this.ready = true; }
  }
  dispose() { this.rt.dispose(); }
}
