// In-memory cache for OpenStreetMap tile data. When you drive back through an area
// (or a tile is unloaded and reloaded) it rebuilds instantly instead of asking the
// busy public map servers again. Least-recently-used tiles are dropped first.
const MAX_MEM = 160;

export class TileCache {
  constructor() { this.mem = new Map(); }
  async get(k) {
    if (!this.mem.has(k)) return null;
    const v = this.mem.get(k); this.mem.delete(k); this.mem.set(k, v); return v;
  }
  put(k, ways) {
    if (!ways) return; this.mem.delete(k); this.mem.set(k, ways);
    while (this.mem.size > MAX_MEM) this.mem.delete(this.mem.keys().next().value);
  }
}
