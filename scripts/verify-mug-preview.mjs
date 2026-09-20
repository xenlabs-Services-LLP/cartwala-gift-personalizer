import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("extensions/cartwala-personalizer/assets/cartwala-personalizer.js", "utf8");
const helpers = source.slice(source.indexOf("  const createMugGeometry"), source.indexOf("  const createMugRenderer"));
const { createMugGeometry, mugRotationMatrix, mugFrame } = vm.runInNewContext(`(() => { ${helpers}; return { createMugGeometry, mugRotationMatrix, mugFrame }; })()`);

for (const model of ["white", "magic", "red", "love-handle"]) {
  const mesh = createMugGeometry(model);
  const count = mesh.vertices.length / 9;
  assert.ok(count < 65536);
  assert.ok(mesh.indices.every((value) => value < count));
  assert.ok(mesh.vertices.every(Number.isFinite));
  assert.equal(mesh.indices.length % 3, 0);
  const materials = new Set();
  let innerWalls = 0, floor = 0, bottom = 0;
  for (let i = 0; i < mesh.vertices.length; i += 9) {
    const [x, y, z, nx, ny, nz, u, v, material] = mesh.vertices.slice(i, i + 9);
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 0.0001);
    assert.ok(u >= 0 && u <= 1 && Number.isFinite(v));
    materials.add(material);
    if (material === 1 && y > -0.95 && y < 1.1 && nx * x + nz * z < 0) innerWalls += 1;
    if (material === 1 && Math.hypot(x, z) < 0.01 && y < -1) floor += 1;
    if (material === 3 && y < -1.1) bottom += 1;
    assert.ok(!(material === 1 && y > 1 && Math.hypot(x, z) < 0.89), "The opening must not contain a lid");
  }
  assert.equal(materials.size, 4);
  assert.ok(innerWalls && floor && bottom, "Mug needs interior walls, interior floor and underside");
  for (const pitch of [-110, -90, -22, 0, 90, 110]) {
    for (const yaw of [0, 25, 90, 170, 270, 360]) {
      const rotation = mugRotationMatrix(pitch, yaw);
      for (const aspect of [0.5, 1, 1.85]) {
        const frame = mugFrame(mesh.vertices, rotation, aspect);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < mesh.vertices.length; i += 9) {
          const x = (rotation[0] * mesh.vertices[i] + rotation[3] * mesh.vertices[i + 1] + rotation[6] * mesh.vertices[i + 2] - frame.center[0]) * frame.scale / aspect;
          const y = (rotation[1] * mesh.vertices[i] + rotation[4] * mesh.vertices[i + 1] + rotation[7] * mesh.vertices[i + 2] - frame.center[1]) * frame.scale;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        assert.ok(minX >= -0.891 && maxX <= 0.891 && minY >= -0.811 && maxY <= 0.811, "Handle and body must stay inside the preview");
        assert.ok(Math.abs(minX + maxX) < 0.0001 && Math.abs(minY + maxY) < 0.0001, "Entire mug must be centered at every angle");
      }
    }
  }
}
assert.notDeepEqual(createMugGeometry("white").vertices, createMugGeometry("love-handle").vertices);
for (const aspect of [0.35, 0.5, 0.8, 1, 1.85]) {
  let sharedScale;
  for (const model of ["white", "magic", "red", "love-handle"]) {
    const mesh = createMugGeometry(model);
    for (const yaw of [170, 90, 10]) {
      const rotation = mugRotationMatrix(-18, yaw);
      const footprint = yaw === 90 ? 2.05 : 3.05;
      const viewAspect = aspect * footprint / 3.05;
      const frame = mugFrame(mesh.vertices, rotation, viewAspect, true, footprint);
      sharedScale ??= frame.scale;
      assert.ok(Math.abs(frame.scale - sharedScale) < 1e-10, "All gallery models and views must use an identical scale");
      assert.equal(frame.center[1], 0, "Gallery bodies must share their vertical baseline");
      for (let i = 0; i < mesh.vertices.length; i += 9) {
        const x = (rotation[0] * mesh.vertices[i] + rotation[3] * mesh.vertices[i + 1] + rotation[6] * mesh.vertices[i + 2] - frame.center[0]) * frame.scale / viewAspect;
        const y = (rotation[1] * mesh.vertices[i] + rotation[4] * mesh.vertices[i + 1] + rotation[7] * mesh.vertices[i + 2]) * frame.scale;
        assert.ok(Math.abs(x) < 0.98 && Math.abs(y) < 0.9, "Each complete mug must fit its own gallery column with spacing");
      }
    }
  }
}
assert.match(source, /vPosition = aPosition/);
assert.match(source, /ink\.fillText\("Cartwala", 256, 216\)/);
assert.match(source, /ink\.fillText\("Preview", 256, 288\)/);
assert.match(source, /texture2D\(uBrand, vPosition\.xz \/ 1\.5/);
assert.match(source, /vMaterial > 2\.5\) \{\s+vec4 brand = texture2D\(uBrand/);
assert.match(source, /deleteTexture\(brandTexture\)/);
assert.match(source, /dot\(vPosition\.xz, vPosition\.xz\) < 1\.0\) discard/);
assert.match(source, /Boolean\(scene\.closest\?\.\("\.cw-mug-preview__views"\)\)/);
assert.match(source, /setHeated\(mugModel === "magic"\)/);
assert.match(source, /magicToggles\.forEach/);
assert.match(source, /version !== imageVersion/);
assert.match(source, /CLAMP_TO_EDGE/);
assert.match(source, /webglcontextrestored/);
assert.match(source, /next\.crossOrigin = "anonymous"/);
assert.match(source, /vUV\.x > 0\.075 && vUV\.x < 0\.925/);

const rendererCode = source.slice(source.indexOf("  const createMugRenderer"), source.indexOf("  const initializeMugPreview"));
const calls = [];
let lost = false;
const gl = new Proxy({
  isContextLost: () => lost,
  getShaderParameter: () => true,
  getProgramParameter: () => true,
  getParameter: () => 1024,
  getUniformLocation: (_, key) => key,
  getAttribLocation: () => 0,
}, { get: (target, key) => {
  if (key in target) return target[key];
  if (/^[A-Z_0-9]+$/.test(key)) return key;
  return (...args) => { calls.push([key, ...args]); return {}; };
} });
const images = [];
const canvases = [];
let allowGL = true;
let disconnects = 0;
const context = {
  console,
  window: { devicePixelRatio: 3 },
  document: { createElement: (tag) => {
    const element = { tag, hidden: false, listeners: {}, setAttribute() {}, addEventListener(name, callback) { this.listeners[name] = callback; } };
    if (tag === "canvas") {
      element.getContext = (type) => type === "webgl" ? (allowGL ? gl : null) : { drawImage() {}, clearRect() {}, fillText() {} };
      canvases.push(element);
    }
    return element;
  } },
  Image: class { constructor() { this.naturalWidth = 3000; this.naturalHeight = 1200; images.push(this); } },
  ResizeObserver: class { observe() {} disconnect() { disconnects += 1; } },
};
const makeRenderer = vm.runInNewContext(`(() => { ${helpers}; ${rendererCode}; return createMugRenderer; })()`, context);
const scene = { dataset: {}, children: [], append(...children) { this.children.push(...children); }, getBoundingClientRect: () => ({ width: 320, height: 260 }) };
const renderer = makeRenderer(scene, "magic", createMugGeometry("magic"), "Saved design fallback");
const state = { rotationX: -22, rotationY: 25, heated: false, handleColour: "#171717", innerColour: "#fff" };
const uniform = (key) => calls.filter((c) => c[0] === "uniform1f" && c[1] === key).at(-1)?.[2];
renderer.render(state);
assert.equal(uniform("uReveal"), 0);
assert.equal(uniform("uTextured"), 0);
assert.equal(canvases[0].width, 640, "DPR is capped at two");
renderer.setTexture("first-design");
renderer.setTexture("latest-design");
images[1].onload();
assert.equal(scene.children[1].src, "latest-design");
assert.equal(scene.dataset.cwRenderState, "ready");
assert.equal(uniform("uTextured"), 1);
images[0].onload();
assert.equal(scene.children[1].src, "latest-design", "Stale image loads must not replace the saved design");
assert.equal(canvases[2].width, 1024, "Large print textures respect the device texture limit");
renderer.render({ ...state, heated: true });
assert.equal(uniform("uReveal"), 1);
renderer.render(state);
assert.equal(uniform("uReveal"), 0);
lost = true;
canvases[0].listeners.webglcontextlost({ preventDefault() {} });
assert.equal(scene.dataset.cwRenderState, "fallback");
assert.equal(scene.children[1].hidden, false);
lost = false;
canvases[0].listeners.webglcontextrestored();
assert.equal(scene.dataset.cwRenderState, "ready");
assert.equal(uniform("uTextured"), 1);
renderer.setTexture("after-disposal");
renderer.dispose();
images[2].onload();
assert.equal(scene.children[1].src, "latest-design");
assert.equal(disconnects, 1);
allowGL = false;
const noGLScene = { ...scene, dataset: {}, children: [] };
const fallbackRenderer = makeRenderer(noGLScene, "white", createMugGeometry("white"), "Saved design fallback");
fallbackRenderer.setTexture("fallback-design");
images[3].onload();
assert.equal(noGLScene.dataset.cwRenderState, "fallback");
assert.equal(noGLScene.children[1].src, "fallback-design");
assert.equal(noGLScene.children[1].hidden, false);
fallbackRenderer.dispose();
console.log("Mug preview geometry, hollow interior, framing, handles, hot/cold state, texture loading, fallback and context recovery regressions passed.");
