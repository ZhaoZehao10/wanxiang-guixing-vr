await page.goto('https://localhost:8443/', { waitUntil: 'domcontentloaded', ignoreHTTPSErrors: true });
await page.waitForTimeout(1200);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const info = await page.evaluate(() => ({
  title: document.title,
  hasCanvas: !!document.getElementById('c3d'),
  introVisible: !document.getElementById('intro').classList.contains('hidden'),
  webxr: typeof navigator.xr !== 'undefined' ? await navigator.xr.isSessionSupported('immersive-vr').catch((e) => 'err:' + e.message) : 'no-xr',
}));
// 点击进入难度选择
await page.mouse.click(400, 300);
await page.waitForTimeout(400);
const diffVisible = await page.evaluate(() => !document.getElementById('difficulty').classList.contains('hidden'));
// 选择 2 块开始游戏
const btns = await page.$$('#difficulty .diff-btn');
let clicked = false;
for (const b of btns) {
  const t = await b.textContent();
  if (t.includes('2 块')) { await b.click(); clicked = true; break; }
}
await page.waitForTimeout(800);
const game = await page.evaluate(() => ({
  hudVisible: !document.getElementById('hud').classList.contains('hidden'),
  counter: document.getElementById('placed-counter').textContent,
  modelName: document.getElementById('model-name').textContent,
}));
await page.screenshot({ path: 'D:/DSH_Workspace/Pico3D/test/preview-2d.png' });
return { info, diffVisible, clicked, game, errors };
