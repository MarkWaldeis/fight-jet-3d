// Smoke-Test: Rakete startet am Hardpoint, hat Visual, fliegt los
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const preview = spawn(
  'npx',
  ['vite', 'preview', '--host', '127.0.0.1', '--port', '4191', '--strictPort'],
  { cwd: root, shell: true, stdio: 'ignore' }
);
await new Promise((r) => setTimeout(r, 5500));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1280, height: 720 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message || e)));

await page.goto('http://127.0.0.1:4191/', { waitUntil: 'networkidle0', timeout: 90000 });
await new Promise((r) => setTimeout(r, 5000));

const report = await page.evaluate(async () => {
  const g = window.__game;
  if (!g) return { ok: false, error: 'no game' };

  await g.startGame('f16');
  await new Promise((r) => setTimeout(r, 2000));

  const enemy = g.enemies?.find((e) => e.alive);
  if (!enemy) return { ok: false, error: 'no enemy' };

  g.player.lockTarget = enemy;
  g.player.lockProgress = 1;
  g.player.missilesLeft = 4;

  const hardpoints = g.player.getHardpoints();
  if (!hardpoints?.length) return { ok: false, error: 'no hardpoints' };

  const hpWorld = hardpoints[0]
    .clone()
    .applyQuaternion(g.player.object.quaternion)
    .add(g.player.position);

  const before = g.missiles.length;
  // private only at compile time
  g.launchPlayerMissile();
  if (g.missiles.length <= before) {
    return { ok: false, error: 'launch did not spawn', before, after: g.missiles.length };
  }

  const m = g.missiles[g.missiles.length - 1];
  const distToHp = m.object.position.distanceTo(hpWorld);
  const childCount = m.object.children.length;
  const start = m.object.position.clone();
  for (let i = 0; i < 40; i++) m.update(0.05);
  const moved = m.object.position.distanceTo(start);

  // Visual should be more than just flame (2+) if GLB loaded, or 2 for capsule+flame
  return {
    ok: distToHp < 30 && moved > 40 && childCount >= 2,
    distToHp: +distToHp.toFixed(2),
    moved: +moved.toFixed(1),
    childCount,
    hardpoints: hardpoints.length,
    jetId: g.player.jetId,
  };
});

console.log(JSON.stringify(report, null, 2));
console.log('errors', errs.slice(0, 6));
await browser.close();
preview.kill();
process.exit(report?.ok ? 0 : 1);
