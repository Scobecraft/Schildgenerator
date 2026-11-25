// Auslastung des Containers: CPU, RAM und Speicherplatz.
// Liest die cgroup-Werte (Docker, v2 oder v1). Ohne cgroup werden die Werte des Systems genommen.

const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch (_) { return null; } };
const num = (v) => (v == null || v === '' || v === 'max' ? null : Number(v));

const CG2 = fs.existsSync('/sys/fs/cgroup/cgroup.controllers');

// Anzahl CPUs, die der Container nutzen darf
function cpuLimit() {
  const hostCpus = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  if (CG2) {
    const [quota, period] = (read('/sys/fs/cgroup/cpu.max') || 'max 100000').split(/\s+/);
    if (quota !== 'max' && Number(period) > 0) return Math.min(hostCpus, Number(quota) / Number(period));
  } else {
    const quota = num(read('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'));
    const period = num(read('/sys/fs/cgroup/cpu/cpu.cfs_period_us'));
    if (quota > 0 && period > 0) return Math.min(hostCpus, quota / period);
  }
  return hostCpus;
}

// Verbrauchte CPU-Zeit in Mikrosekunden
function cpuUsageUs() {
  if (CG2) {
    const m = /usage_usec\s+(\d+)/.exec(read('/sys/fs/cgroup/cpu.stat') || '');
    if (m) return Number(m[1]);
  } else {
    const ns = num(read('/sys/fs/cgroup/cpuacct/cpuacct.usage'));
    if (ns != null) return ns / 1000;
  }
  // Fallback: ganze Maschine
  const t = os.cpus().reduce((s, c) => s + c.times.user + c.times.sys + c.times.irq + c.times.nice, 0);
  return t * 1000; // ms -> µs
}

function memory() {
  const hostTotal = os.totalmem();
  let used = null, limit = null;
  if (CG2) {
    used = num(read('/sys/fs/cgroup/memory.current'));
    limit = num(read('/sys/fs/cgroup/memory.max'));
    const inactive = /inactive_file\s+(\d+)/.exec(read('/sys/fs/cgroup/memory.stat') || '');
    if (used != null && inactive) used -= Number(inactive[1]); // wie "docker stats": Datei-Cache abziehen
  } else {
    used = num(read('/sys/fs/cgroup/memory/memory.usage_in_bytes'));
    limit = num(read('/sys/fs/cgroup/memory/memory.limit_in_bytes'));
    const inactive = /total_inactive_file\s+(\d+)/.exec(read('/sys/fs/cgroup/memory/memory.stat') || '');
    if (used != null && inactive) used -= Number(inactive[1]);
  }
  if (used == null) used = hostTotal - os.freemem();
  if (!limit || limit > hostTotal) limit = hostTotal; // "kein Limit" = so viel wie der Server hat
  return { used: Math.max(0, used), total: limit };
}

function disk() {
  try {
    const dir = fs.existsSync(DATA_DIR) ? DATA_DIR : __dirname;
    const s = fs.statfsSync(dir);
    const used = (s.blocks - s.bfree) * s.bsize;
    const avail = s.bavail * s.bsize;
    return { used, total: used + avail }; // wie "df": belegt / (belegt + frei verfügbar)
  } catch (_) {
    return null;
  }
}

// CPU-Auslastung wird alle 2 Sekunden gemessen
let last = { t: process.hrtime.bigint(), usage: cpuUsageUs() };
let cpuPercent = 0;
setInterval(() => {
  const now = process.hrtime.bigint();
  const usage = cpuUsageUs();
  const wallUs = Number(now - last.t) / 1000;
  if (wallUs > 0) cpuPercent = Math.max(0, Math.min(100, ((usage - last.usage) / (wallUs * cpuLimit())) * 100));
  last = { t: now, usage };
}, 2000).unref();

function snapshot() {
  const mem = memory();
  const d = disk();
  return {
    cpu: { percent: Math.round(cpuPercent), cores: Math.round(cpuLimit() * 10) / 10 },
    ram: { percent: Math.round((mem.used / mem.total) * 100), used: mem.used, total: mem.total },
    disk: d ? { percent: Math.round((d.used / d.total) * 100), used: d.used, total: d.total } : null,
  };
}

module.exports = { snapshot };
