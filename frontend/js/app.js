import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* ===================== SIM (simulated fallback health; real data replaces it when available) ===================== */
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const sim = { healthAt(x, y, r) {
  const k = r / 400; let h = 0.82 + 0.1 * Math.sin(x * 0.04 / k) * Math.cos(y * 0.033 / k) + 0.05 * Math.sin((x + y) * 0.09 / k);
  h -= 0.5 * Math.exp(-((x - 0.45 * r) ** 2 + (y + 0.25 * r) ** 2) / (2 * (0.22 * r) ** 2)); h -= 0.25 * Math.exp(-((x + 0.5 * r) ** 2 + (y - 0.4 * r) ** 2) / (2 * (0.18 * r) ** 2)); return clamp(h); } };
const CLS = ["A", "B", "C", "D"], CCOL = ["#7cc242", "#ffc531", "#ff8a3d", "#e0453a"];

/* ===================== 3D VIEWER (PBR materials, soft shadows, procedural leaf/fruit textures) ===================== */
const vbox = document.getElementById("viewbox"), vel = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; vel.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xcfe8f0, 180, 1500);
{ const c = document.createElement("canvas"); c.width = 2; c.height = 256; const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "#5ea9d6"); gr.addColorStop(0.7, "#cfe8f0"); gr.addColorStop(1, "#e9f3ea"); g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
const camera = new THREE.PerspectiveCamera(50, 1, 0.2, 20000);
const controls = new OrbitControls(camera, renderer.domElement); controls.maxPolarAngle = Math.PI * 0.49;
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6b6a4a, 1.1));
const sun = new THREE.DirectionalLight(0xfff0d0, 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
{ const sc = sun.shadow.camera; sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 900; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; }
scene.add(sun, sun.target); let sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
function setSun(lat, date) {
  if (isNaN(date)) return; const rad = Math.PI / 180, n = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5), dec = 23.44 * Math.sin(2 * Math.PI * (284 + n) / 365) * rad, ph = lat * rad, H = -35 * rad;
  const se = Math.sin(ph) * Math.sin(dec) + Math.cos(ph) * Math.cos(dec) * Math.cos(H), el = Math.asin(se), az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(ph) - Math.tan(dec) * Math.cos(ph)) + Math.PI;
  sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize(); sun.intensity = 2 + 2 * se;
}
function vresize() { const w = vel.clientWidth, h = vel.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(vresize).observe(vel);
const attach = (slot) => { slot.appendChild(vbox); vresize(); };

// ---- procedural textures ----
const cnv = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; };
const tex = (c, rep) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } return t; };
const LEAFTEX = (() => { const [c, g] = cnv(128, 256), gr = g.createLinearGradient(0, 256, 0, 0); gr.addColorStop(0, "#2c5a26"); gr.addColorStop(0.55, "#5f9238"); gr.addColorStop(0.92, "#7aa545"); gr.addColorStop(1, "#8a5a34"); g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
  g.strokeStyle = "rgba(20,50,15,.22)"; g.lineWidth = 1; for (let i = 1; i < 14; i++) { g.beginPath(); g.moveTo(i * 128 / 14, 256); g.lineTo(i * 128 / 14, 0); g.stroke(); }
  g.strokeStyle = "rgba(205,232,150,.5)"; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 256); g.lineTo(64, 0); g.stroke();
  const bg = g.createLinearGradient(0, 256, 0, 200); bg.addColorStop(0, "rgba(210,230,170,.55)"); bg.addColorStop(1, "rgba(210,230,170,0)"); g.fillStyle = bg; g.fillRect(0, 200, 128, 56);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "20,40,10" : "170,200,110"},${Math.random() * 0.08})`; g.fillRect(Math.random() * 128, Math.random() * 256, 2, 3); } return tex(c); })();
const FRUITTEX = (() => { const [c, g] = cnv(256, 256); g.fillStyle = "#7d7d7d"; g.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 16; r++) for (let q = 0; q < 16; q++) { const x = (q + (r % 2 ? 0.5 : 0)) * 16 + 8, y = r * 16 + 8, gr = g.createRadialGradient(x, y, 0, x, y, 9); gr.addColorStop(0, "#fff"); gr.addColorStop(1, "#b4b4b4"); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 7.5, 6.5, 0, 0, 6.283); g.fill(); }
  return tex(c, [3, 2]); })();
const NOISE = (() => { const [c, g] = cnv(256, 256), [s, sg] = cnv(48, 48), im = sg.createImageData(48, 48); for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  sg.putImageData(im, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(s, 0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(70, 70); return t; })();

// ---- geometry: folded, tapered, UV-mapped leaves; barrel-shaped fruit; spiral crown ----
function leafGeo(s, tilt) {
  const seg = 3, L = 0.85 * s, pos = [], uv = [], idx = []; let x = 0, y = 0, a = tilt;
  for (let i = 0; i <= seg; i++) { const t = i / seg, w = 0.085 * Math.pow(1 - t, 0.6) + 0.004, nx = Math.cos(a) * 0.016, ny = -Math.sin(a) * 0.016;
    pos.push(x, y, -w, x + nx, y + ny, 0, x, y, w); uv.push(0, t, 0.5, t, 1, t); a += 0.33; x += Math.sin(a) * L / seg; y += Math.cos(a) * L / seg; }
  for (let i = 0; i < seg; i++) { const k = i * 3; idx.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const PG = mergeGeometries(Array.from({ length: 8 }, (_, i) => { const g = leafGeo(0.8 + 0.2 * ((i * 5) % 7) / 6, 0.1 + 0.13 * (i % 4)); g.rotateY(i * 2.399); return g; }));
const FG = new THREE.SphereGeometry(0.1, 10, 7); { const p = FG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), t = y / 0.1, k = 1 - 0.14 * t * t; p.setXYZ(i, p.getX(i) * k, y * 1.55 + 0.2, p.getZ(i) * k); } FG.computeVertexNormals(); }
const CG = mergeGeometries(Array.from({ length: 9 }, (_, i) => { const g = new THREE.ConeGeometry(0.022, 0.24, 3, 1, true); g.translate(0, 0.12, 0); g.rotateZ(0.12 + 0.28 * (i % 3) / 2); g.rotateY(i * 2.399); g.translate(0, 0.345, 0); return g; }));

let current, leaves, fruit, crown, vdata, vinfo, sel = [], stride = 2, vdap = 0, colorMode = "natural", growthFn = () => ({ plant: 1, fruit: 0, ripe: 0 });
const vis = { plants: true, fruit: true }, tmp = new THREE.Object3D(), col = new THREE.Color();
const GREEN = new THREE.Color(0x7a9a35), GOLD = new THREE.Color(0xe0a020);
const rnd = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
const setGrowth = (f) => { growthFn = f; };

function clearInstances() { for (const m of [leaves, fruit, crown]) if (m) { scene.remove(m); m.dispose(); } leaves = fruit = crown = null; }
function clearTwin() { if (current) scene.remove(current); current = null; clearInstances(); vdata = vinfo = null; }
function build() {
  clearInstances(); if (!vdata) return; sun.castShadow = stride <= 2;
  sel = []; for (let i = 0; i < vdata.x.length; i += stride) sel.push(i); const n = sel.length;
  leaves = new THREE.InstancedMesh(PG, new THREE.MeshStandardMaterial({ map: LEAFTEX, side: THREE.DoubleSide, roughness: 0.62, metalness: 0 }), n);
  fruit = new THREE.InstancedMesh(FG, new THREE.MeshStandardMaterial({ map: FRUITTEX, bumpMap: FRUITTEX, bumpScale: 1.2, roughness: 0.55, metalness: 0 }), n);
  crown = new THREE.InstancedMesh(CG, new THREE.MeshStandardMaterial({ color: 0x4f7f2c, side: THREE.DoubleSide, roughness: 0.7 }), n);
  leaves.castShadow = leaves.receiveShadow = true; fruit.receiveShadow = true;
  for (const m of [leaves, fruit, crown]) { m.frustumCulled = false; scene.add(m); }
  refresh(); applyVis();
}
function recolor() {
  if (!leaves) return;
  sel.forEach((i, j) => { const h = vdata.h[i]; colorMode === "health" ? col.setHSL(h * 0.33, 0.85, 0.62) : col.setHSL(h < 0.55 ? 0.14 : 0.25, 0.2 + 0.2 * h, 0.86 + 0.14 * rnd(i, 3)); leaves.setColorAt(j, col); });
  leaves.instanceColor.needsUpdate = true;
}
function setStage(d) {
  vdap = d; if (!leaves) return; const g = growthFn(d), comp = 1 + 0.15 * (stride - 1), cm = colorMode === "class";
  sel.forEach((i, j) => {
    const h = vdata.h[i]; tmp.position.set(vdata.x[i], vdata.z[i], -vdata.y[i]); tmp.rotation.set((rnd(i, 8) - 0.5) * 0.2, rnd(i, 1) * 6.283, (rnd(i, 9) - 0.5) * 0.2);
    tmp.scale.setScalar(g.plant * comp * (0.9 + 0.2 * rnd(i, 2)) * (0.75 + 0.25 * h)); tmp.updateMatrix(); leaves.setMatrixAt(j, tmp.matrix);
    let fs = g.fruit > 0 ? g.fruit * (0.55 + 0.45 * h) * (0.9 + 0.2 * rnd(i, 4)) * Math.sqrt(comp) : 0.0001; if (cm) fs = Math.max(fs, 0.6);
    tmp.scale.setScalar(fs); tmp.updateMatrix(); fruit.setMatrixAt(j, tmp.matrix); crown.setMatrixAt(j, tmp.matrix);
    cm ? col.set(CCOL[vdata.cls ? vdata.cls[i] : 0]) : col.copy(GREEN).lerp(GOLD, Math.min(1, g.ripe * (0.8 + 0.4 * rnd(i, 5)))); fruit.setColorAt(j, col);
  });
  for (const m of [leaves, fruit, crown]) m.instanceMatrix.needsUpdate = true; fruit.instanceColor.needsUpdate = true; leaves.boundingSphere = null;
}
const refresh = () => { recolor(); setStage(vdap); };
function applyVis() { if (!leaves) return; leaves.visible = vis.plants; fruit.visible = crown.visible = vis.fruit; }
const setColorMode = (m) => { colorMode = m; refresh(); };
const setDetail = (n) => { stride = n; build(); };
function setVisible(kind, on) {
  if (kind === "plants" || kind === "fruit") { vis[kind] = on; applyVis(); }
  if (kind === "objects" && current) ["buildings", "trees"].forEach((n) => { const o = current.getObjectByName(n); if (o) o.visible = on; });
}
async function loadTwin(url, plantsUrl, radius) {
  clearTwin();
  const g = await new Promise((ok, fail) => new GLTFLoader().load(url + "?t=" + Date.now(), ok, undefined, fail));
  current = g.scene; scene.add(current);
  current.traverse((o) => { if (!o.isMesh) return;
    if (o.material.map) { o.geometry.computeVertexNormals(); o.material = new THREE.MeshStandardMaterial({ map: o.material.map, bumpMap: NOISE, bumpScale: 1.4, roughness: 1, metalness: 0 }); o.receiveShadow = true; }
    else { o.material.metalness = 0; o.material.roughness = 1; o.castShadow = o.receiveShadow = true; } });
  const b = new THREE.Box3().setFromObject(current), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  const d = await (await fetch(plantsUrl + "?t=" + Date.now(), { cache: "no-store" })).json();
  vdata = { x: Float32Array.from(d.x), y: Float32Array.from(d.y), z: Float32Array.from(d.z), h: new Float32Array(d.x.length) };
  for (let i = 0; i < vdata.h.length; i++) vdata.h[i] = sim.healthAt(vdata.x[i], vdata.y[i], radius);
  vinfo = { c, d: Math.max(s.x, s.z), top: b.max.y, cz: d.center_z }; build(); setView("close"); return vdata;
}
function setView(mode) {
  if (!vinfo) return; const { c, d, top, cz } = vinfo;
  if (mode === "close") { controls.target.set(0, cz, 0); camera.position.set(10, cz + 5, 13); }
  else if (mode === "top") { controls.target.copy(c); camera.position.set(c.x, top + d * 1.1, c.z + 0.01); }
  else { controls.target.copy(c); camera.position.set(c.x + d * 0.6, top + d * 0.5, c.z + d * 0.8); }
  controls.update();
}
const snapshot = () => { renderer.render(scene, camera); return renderer.domElement.toDataURL("image/png"); };
let pickCb = null, downAt = null; const setPickHandler = (f) => { pickCb = f; };
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), glcv = renderer.domElement;
glcv.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
glcv.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4 || !leaves || !pickCb) return;
  const r = glcv.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera); const hit = ray.intersectObject(leaves)[0]; if (hit && hit.instanceId != null) pickCb(sel[hit.instanceId]);
});
(function loop() { requestAnimationFrame(loop); controls.update(); sun.target.position.copy(controls.target); sun.position.copy(controls.target).addScaledVector(sunDir, 400); sun.target.updateMatrixWorld(); renderer.render(scene, camera); })();

/* ===================== APP ===================== */
const $ = (id) => document.getElementById(id), $$ = (s) => [...document.querySelectorAll(s)], sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5, ZN = ["North-west", "North-east", "South-west", "South-east"], iso = (d) => new Date(d).toISOString().slice(0, 10), fmt = (n, d = 0) => Number(n).toLocaleString("en-US", { maximumFractionDigits: d }), peso = (n) => "₱" + fmt(n);
const STAGES = ["Planting", "Vegetative", "Flower induction", "Fruit development", "Harvest"];
const SCEN = { normal: { shift: 0, y: 1 }, cool: { shift: -2, y: 0.95 }, warm: { shift: 2, y: 0.97 }, dry: { shift: 0, y: 0.88 }, fert: { shift: 0, y: 1.06 } };
const TIPS = { Planting: "Keep soil moist and weed-free while plants establish.", Vegetative: "Apply nitrogen and control weeds; scout for mealybug wilt.", "Flower induction": "Schedule forcing (e.g. ethephon) at target plant size; avoid water stress.",
  "Fruit development": "Apply potassium, keep moisture steady and protect fruit from sunburn.", Harvest: "Check fruit colour and Brix; harvest Class A zones first." };
// Defaults anchored to: PSA 2019 (farmgate ₱10.89/kg, yield 41.6 t/ha, cost ₱94.9k/ha), UPLB study of the DMPI plantation (74,100 plants/ha, ₱191.8k/ha, 2013), ₱1/sucker (NVSU). All editable.
const DEF = { plant: iso(Date.now() - 200 * DAY), v: 2, force: "", base: 15, gddForce: 3000, gddHarv: 1900, target: 1.1, calib: 0,
  mk: { area: 0, density: 74100, bearing: 90, loss: 8, price: [23, 19, 15, 6], rate: 10, outlet: "farm", matUnit: 1, harvestKg: 0.8,
    costs: { "Land preparation": 12000, "Fertilizer": 38000, "Forcing & growth regulators": 6000, "Pest & weed control": 14000, "Labor (cultural)": 24000, "Irrigation / water": 5000, "Overhead & financing": 10000 } } };
const merge = (a, b) => { for (const k in b) a[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] ? merge(a[k], b[k]) : b[k]; return a; };
let CFG = DEF; try { const sv = JSON.parse(localStorage.getItem("pt_cfg") || "{}"), keep = sv.v === DEF.v ? sv : {}; if (sv.v !== DEF.v) { if (sv.plant) keep.plant = sv.plant; if (sv.force) keep.force = sv.force; } CFG = merge(structuredClone(DEF), keep); } catch {}
const PRESETS = [[18.8, 18.8, 15, 6], [23, 19, 15, 6], [40, 30, 19, 8]];
const saveCfg = () => localStorage.setItem("pt_cfg", JSON.stringify(CFG));
const S = { fields: [], cur: null, data: null, stats: null, reg: null, ndvi: null, places: [], wx: [], wxSrc: "", model: null, scen: "normal", dap: null, todayIdx: 0, max: 500, live: null, job: null, play: null, opening: null, pending: null, hSrc: "simulated" };
function toast(msg, type = "info") { const t = document.createElement("div"); t.className = "toast " + type; t.textContent = msg; $("toasts").append(t); setTimeout(() => t.remove(), type === "error" ? 9000 : 3500); }
async function api(url, opt) { const r = await fetch(url, { cache: "no-store", ...opt }); let j = null; try { j = await r.json(); } catch {} if (!r.ok) throw new Error(j?.detail || `${r.status} ${r.statusText}`); return j; }
const busy = (on) => $("topbar").classList.toggle("on", on);
function countTo(el, to, suffix = "") { const t0 = performance.now(); (function f(t) { const k = Math.min(1, (t - t0) / 700); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))) + suffix; if (k < 1) requestAnimationFrame(f); })(t0); }

// ---- routing ----
const pages = ["home", "dashboard", "twin", "phenology", "health", "market", "fields"];
function route(fromNav) {
  let p = pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  if (!S.cur && ["twin", "phenology", "health", "market"].includes(p)) { p = "fields"; if (fromNav === true) toast("Create a field first and this page will fill with its data."); }
  $$(".page").forEach((s) => (s.hidden = s.id !== p)); $$("#nav .links a").forEach((a) => a.classList.toggle("on", a.hash === "#" + p)); document.body.dataset.page = p;
  if (p === "twin") attach($("slotTwin")); if (p === "phenology") attach($("slotPheno")); if (p === "fields") initMap(); redraw();
}
addEventListener("hashchange", () => route(true)); addEventListener("resize", () => redraw());

// ---- map & generation ----
let map, marker, circle, pin;
function place(ll) {
  pin = ll; marker ? marker.setLatLng(ll) : (marker = L.marker(ll).addTo(map)); const r = +$("radius").value;
  circle ? circle.setLatLng(ll).setRadius(r) : (circle = L.circle(ll, { radius: r, color: "#0b4a43", fillColor: "#ffc531", fillOpacity: 0.25 }).addTo(map));
  $("go").disabled = !!S.job; $("hint").textContent = `Pinned ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
}
function initMap() {
  if (!map) { map = L.map("map").setView(S.cur ? [S.cur.lat, S.cur.lon] : [8.37, 124.86], S.cur ? 15 : 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map); map.on("click", (e) => place(e.latlng)); }
  setTimeout(() => map.invalidateSize(), 60);
}
$("radius").onchange = () => pin && place(pin);
async function search() {
  const q = $("q").value.trim(); if (!q) return;
  try { const r = await (await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q))).json();
    if (!r.length) return toast("No place found for “" + q + "”", "error"); const ll = L.latLng(+r[0].lat, +r[0].lon); map.setView(ll, 16); place(ll);
  } catch { toast("Place search failed. Check your connection.", "error"); }
}
$("search").onclick = search; $("q").addEventListener("keydown", (e) => e.key === "Enter" && search());
function showProg(st, ms) {
  $("prog").hidden = false; $("prog").classList.toggle("err", st.status === "error"); $("progBar").style.width = Math.round((st.progress || 0) * 100) + "%";
  $("progMsg").textContent = st.message || ""; $("progTime").textContent = st.status === "running" ? `${Math.round(ms / 1000)} s elapsed. Usually 30–90 s` : "";
}
async function generate() {
  if (!pin || S.job) return; const radius = +$("radius").value, t0 = Date.now();
  $("go").disabled = true; busy(true); showProg({ status: "running", progress: 0.02, message: "Contacting the server…" }, 0); let job;
  try {
    ({ job } = await api("/api/twin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: pin.lat, lon: pin.lng, radius, name: $("fname").value }) }));
    S.job = job; let st;
    while (S.job === job) { await sleep(1000); st = await api("/api/twin/" + job); showProg(st, Date.now() - t0); if (st.status !== "running") break; }
    if (S.job !== job) return toast("Stopped waiting. The server may still finish; check Saved fields.");
    if (st.status === "error") throw new Error(st.message);
    $("prog").hidden = true; await loadFields(); await openField(st.field.id); toast("Your 3D twin is ready", "ok"); location.hash = "#twin";
  } catch (e) { showProg({ status: "error", progress: 0, message: "Failed: " + e.message }, 0); toast(e.message, "error"); console.error(e); }
  finally { S.job = null; busy(false); $("go").disabled = !pin; }
}
$("go").onclick = generate; $("cancel").onclick = () => { S.job = null; $("prog").hidden = true; busy(false); $("go").disabled = !pin; };

// ---- fields (switching fully clears the old twin and loads the new one) ----
async function loadFields() {
  try { S.fields = await api("/api/fields"); } catch (e) { S.fields = []; toast("Could not reach the server: " + e.message, "error"); }
  $("fieldSel").hidden = !S.fields.length; $("fieldSel").innerHTML = S.fields.map((f) => `<option value="${f.id}" ${S.cur?.id === f.id ? "selected" : ""}>${f.name}</option>`).join("");
  $("fieldList").innerHTML = S.fields.length ? S.fields.map((f) => `<div class="fcard ${S.cur?.id === f.id ? "on" : ""}"><span><b>${f.name}</b><small>${f.radius} m · ${f.buildings} buildings · ${f.trees} trees</small></span>
    <span><button class="btn deep" data-open="${f.id}">Open</button> <button class="btn line" data-del="${f.id}">✕</button></span></div>`).join("") : '<div class="mute">No saved fields yet.</div>';
  $$("[data-open]").forEach((b) => (b.onclick = async () => { await openField(b.dataset.open); location.hash = "#twin"; }));
  $$("[data-del]").forEach((b) => (b.onclick = async () => { if (!confirm("Delete this field and its 3D twin?")) return;
    try { await api("/api/fields/" + b.dataset.del, { method: "DELETE" }); if (S.cur?.id === b.dataset.del) { clearTwin(); S.cur = S.data = S.stats = S.reg = S.ndvi = S.model = null; localStorage.removeItem("pt_cur"); } await loadFields(); redraw(); } catch (e) { toast(e.message, "error"); } }));
}
$("fieldSel").onchange = (e) => openField(e.target.value);
function vload(msg) { $("vload").hidden = !msg; $("vload").textContent = msg || ""; }
async function openField(id) {
  const meta = S.fields.find((f) => f.id === id); if (!meta) return;
  if (S.opening) { S.pending = id; return; } S.opening = id; busy(true); vload(`Loading ${meta.name}…`);
  clearTwin(); S.cur = S.data = S.stats = S.reg = S.ndvi = S.model = null; S.places = []; S.live = null; $("empty").hidden = false; $("empty").textContent = `Loading ${meta.name}…`; pmReset();
  try {
    S.data = await loadTwin(`/storage/fields/${id}/twin.glb`, `/storage/fields/${id}/plants.json`, meta.radius); S.cur = meta; localStorage.setItem("pt_cur", id);
    S.rf = 0; for (const x of S.data.x) S.rf = Math.max(S.rf, Math.abs(x)); pmIndex(); applyHealth(); buildRegistry(); $("empty").hidden = true;
    $("vtitle").textContent = `${meta.name} · ${S.data.x.length.toLocaleString()} plants shown`; toast(`Opened ${meta.name}`, "ok");
    loadWeatherSeries(); loadNdvi(); loadPlaces(); loadLive();
  } catch (e) { $("empty").hidden = false; $("empty").textContent = "Could not load this field's 3D twin: " + e.message; toast("Could not load this 3D twin: " + e.message, "error"); console.error(e); }
  finally { S.opening = null; vload(null); busy(false); }
  await loadFields(); route(); if (S.pending) { const p = S.pending; S.pending = null; return openField(p); }
}

// ---- growth model: heat units (growing degree days) from real weather ----
function calc(shift) {
  let g = 0; const gdd = S.wx.map((w) => (g += Math.max(0, w.t + (w.src === "obs" ? 0 : shift) - CFG.base)));
  let gF = CFG.gddForce; if (CFG.force) { const i = S.wx.findIndex((w) => w.date >= CFG.force); if (i >= 0) gF = gdd[i]; }
  const f = (v) => gdd.findIndex((x) => x >= v); return { gdd, gF, gH: gF + CFG.gddHarv, force: f(gF), fruit: f(gF + 250), harv: f(gF + CFG.gddHarv) };
}
const wxFallback = () => Array.from({ length: 720 }, (_, i) => ({ date: iso(new Date(CFG.plant).getTime() + i * DAY), t: 26, rain: 6, src: "fallback" }));
async function loadWeatherSeries() {
  if (!S.cur) return; const id = S.cur.id;
  try { const j = await api(`/api/weather?lat=${S.cur.lat}&lon=${S.cur.lon}&plant=${CFG.plant}`); if (S.cur?.id !== id) return; S.wx = j.days; S.wxSrc = "observed → forecast → climate average"; }
  catch (e) { S.wx = wxFallback(); S.wxSrc = "FALLBACK 26 °C average (weather service unreachable)"; toast("Weather service unavailable; growth uses a 26 °C average. " + e.message, "error"); }
  recalc();
}
function recalc() {
  if (!S.wx.length) return; const sc = SCEN[S.scen]; S.model = calc(sc.shift); S.early = calc(sc.shift + 1.5).harv; S.late = calc(sc.shift - 1.5).harv;
  const t = iso(Date.now()); S.todayIdx = Math.max(0, S.wx.findIndex((w) => w.date >= t)); S.max = Math.min(S.wx.length - 1, (S.model.harv > 0 ? S.model.harv : S.wx.length - 1) + 45);
  $("dap").max = S.max; if (S.dap == null || S.dap > S.max) S.dap = Math.min(S.todayIdx, S.max); $("dap").value = S.dap; setGrowth(growth); setStage(S.dap); setSun(S.cur?.lat ?? 8, new Date(S.wx[S.dap].date)); buildRegistry(); redraw();
}
function stageOf(d) { const m = S.model, g = m.gdd[Math.min(d, m.gdd.length - 1)]; return g < 300 ? STAGES[0] : g < m.gF ? STAGES[1] : g < m.gF + 250 ? STAGES[2] : g < m.gH ? STAGES[3] : STAGES[4]; }
function growth(d) { const m = S.model, g = m.gdd[Math.min(d, m.gdd.length - 1)]; return { plant: clamp(0.25 + 0.75 * g / m.gF), fruit: clamp((g - m.gF - 250) / (m.gH - m.gF - 250)), ripe: clamp((g - m.gH + 300) / 300) }; }
const dateAt = (i) => (i >= 0 && S.wx[i] ? new Date(S.wx[i].date).toDateString().slice(4) : "beyond horizon");

// ---- health (satellite NDVI when available), per-pineapple registry, stats ----
function ndAt(u, v) {
  const g = S.ndvi.grid, n = S.ndvi.n, i0 = Math.floor(clamp(v, 0, n - 1.001)), j0 = Math.floor(clamp(u, 0, n - 1.001)), fy = v - i0, fx = u - j0, c = [g[i0][j0], g[i0][j0 + 1], g[i0 + 1][j0], g[i0 + 1][j0 + 1]];
  if (c.some((x) => x == null)) { const a = c.filter((x) => x != null); return a.length ? a.reduce((p, q) => p + q) / a.length : null; }
  return c[0] * (1 - fx) * (1 - fy) + c[1] * fx * (1 - fy) + c[2] * (1 - fx) * fy + c[3] * fx * fy;
}
function applyHealth() {
  const d = S.data, r = S.cur.radius, ok = !!S.ndvi?.grid, n = S.ndvi?.n;
  for (let i = 0; i < d.x.length; i++) { let h = sim.healthAt(d.x[i], d.y[i], r);
    if (ok) { const nd = ndAt((d.x[i] + r) / (2 * r) * (n - 1), (r - d.y[i]) / (2 * r) * (n - 1)); if (nd != null) h = clamp((nd - 0.3) / 0.55 + (rnd(i, 7) - 0.5) * 0.12); } d.h[i] = h; }
  S.hSrc = ok ? `satellite NDVI ${S.ndvi.date}` : "simulated";
}
const tgtW = () => (CFG.calib > 0 ? CFG.calib : CFG.target);
function buildRegistry() {
  const d = S.data; if (!d) return; const n = d.x.length, tgt = tgtW(), cls = new Uint8Array(n), w = new Float32Array(n), vol = new Float32Array(n);
  for (let i = 0; i < n; i++) { const h = d.h[i], wt = tgt * (0.45 + 0.55 * Math.pow(h, 1.2)) * (0.9 + 0.2 * rnd(i, 6)); w[i] = wt; vol[i] = wt / 0.85; cls[i] = wt >= 0.85 * tgt && h >= 0.7 ? 0 : wt >= 0.7 * tgt ? 1 : wt >= 0.5 * tgt ? 2 : 3; }
  S.reg = { cls, w, vol, n }; d.cls = cls; computeStats(); refresh();
}
function computeStats() {
  const d = S.data, r = S.reg, n = d.x.length, c = [0, 0, 0, 0], kg = [0, 0, 0, 0], z = [0, 1, 2, 3].map(() => ({ h: 0, n: 0, a: 0, kg: 0 })); let s = 0;
  for (let i = 0; i < n; i++) { const k = r.cls[i], q = (d.x[i] > 0 ? 1 : 0) + (d.y[i] < 0 ? 2 : 0); c[k]++; kg[k] += r.w[i]; s += d.h[i]; z[q].h += d.h[i]; z[q].n++; z[q].kg += r.w[i]; if (!k) z[q].a++; }
  S.stats = { avg: s / n, c, kg, n, zones: z.map((o) => ({ h: o.n ? o.h / o.n : 0, n: o.n, a: o.n ? o.a / o.n * 100 : 0, kg: o.kg })) };
}
async function loadNdvi() {
  if (!S.cur) return; const id = S.cur.id; renderNdviInfo("loading");
  try { const j = await api("/api/ndvi/" + id); if (S.cur?.id !== id) return; S.ndvi = j.grid ? j : null; S.ndviErr = j.error; if (S.ndvi) { applyHealth(); buildRegistry(); toast(`Satellite crop health loaded (Sentinel-2, ${j.date})`, "ok"); } }
  catch (e) { S.ndvi = null; S.ndviErr = e.message; }
  renderNdviInfo(); redraw();
}
async function loadPlaces() { if (!S.cur) return; const id = S.cur.id; try { const j = await api(`/api/market/places?lat=${S.cur.lat}&lon=${S.cur.lon}`); if (S.cur?.id === id) S.places = j.places; } catch { S.places = []; } redraw(); }
async function loadLive() {
  if (!S.cur) return;
  try { const j = await api(`https://api.open-meteo.com/v1/forecast?latitude=${S.cur.lat}&longitude=${S.cur.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,cloud_cover&hourly=soil_moisture_1_to_3cm,soil_temperature_0cm&daily=precipitation_sum,temperature_2m_max,uv_index_max&forecast_days=7&timezone=auto`);
    const c = j.current, hi = Math.max(0, j.hourly.time.findIndex((t) => t >= c.time.slice(0, 13) + ":00"));
    S.live = { t: c.temperature_2m, feels: c.apparent_temperature, rh: c.relative_humidity_2m, p: c.precipitation, wind: c.wind_speed_10m, cloud: c.cloud_cover, soil: j.hourly.soil_moisture_1_to_3cm?.[hi] ?? null, soilT: j.hourly.soil_temperature_0cm?.[hi] ?? null,
      uv: j.daily.uv_index_max?.[0] ?? null, rain3: j.daily.precipitation_sum.slice(0, 3).reduce((x, y) => x + y, 0), at: c.time.slice(11, 16), daily: j.daily };
  } catch { S.live = null; } redraw();
}
function renderWxBar() {
  const w = S.live, sm = w?.soil, sl = sm == null ? "" : sm < 0.2 ? "dry" : sm < 0.4 ? "moist" : "wet"; $("wxUpd").textContent = w ? `Updated ${w.at} · refreshes every 10 min · Open-Meteo` : "";
  $("wxTiles").innerHTML = w ? [["Temperature", w.t + "°C", "feels like " + w.feels + "°"], ["Humidity", w.rh + "%", ""], ["Rain now", w.p + " mm", "next 3 days " + fmt(w.rain3) + " mm"], ["Wind", w.wind + " km/h", ""], ["Cloud cover", w.cloud + "%", ""], ["UV index", w.uv ?? "–", "today's max"],
    ["Soil moisture", sm == null ? "n/a" : fmt(sm * 100) + "%", sl], ["Soil temp", w.soilT == null ? "n/a" : w.soilT + "°C", "surface"]].map(([k, v, x]) => `<div class="wt"><small>${k}</small><b>${v}</b><em>${x}</em></div>`).join("") : '<div class="mute">Live weather unavailable. Check your connection.</div>';
}

// ---- market & ROI ----
function econBase() {
  const m = CFG.mk, st = S.stats, area = m.area > 0 ? m.area : Math.PI * S.cur.radius ** 2 / 1e4, plants = area * m.density * m.bearing / 100, scale = plants / st.n, k = scale * (1 - m.loss / 100);
  const kg = st.kg.map((v) => v * k * SCEN[S.scen].y), totalKg = kg.reduce((a, b) => a + b, 0), out = m.outlet === "farm" ? null : S.places[+m.outlet], dist = out ? out.km * 1.3 : 0;
  const lines = { ...m.costs, "Planting material (suckers)": area * m.density * m.matUnit }; for (const key in m.costs) lines[key] = m.costs[key] * area;
  const fixed = Object.values(lines).reduce((a, b) => a + b, 0), varKg = m.harvestKg + dist * m.rate / 1000, cycle = Math.max(6, S.model && S.model.harv > 0 ? S.model.harv / 30.4 : 14);
  return { area, plants, kg, totalKg, lines, fixed, varKg, dist, out, cycle, price: m.price };
}
const econ = (b, pm = 1, ym = 1) => { const rev = b.kg.reduce((a, v, i) => a + v * ym * b.price[i] * pm, 0), cost = b.fixed + b.varKg * b.totalKg * ym; return { rev, cost, profit: rev - cost, roi: (rev - cost) / cost * 100 }; };
function renderMarketInputs() {
  const m = CFG.mk, ip = (k, v, st = "any") => `<input class="num2" data-k="${k}" type="number" step="${st}" value="${v}">`;
  $("mkIn").innerHTML = `<h3>Field &amp; crop</h3><label>Area (ha) <span class="note2">0 = from field</span>${ip("area", m.area, "0.1")}</label><label>Plants per ha ${ip("density", m.density, 100)}</label><label>Fruit-bearing %${ip("bearing", m.bearing)}</label><label>Post-harvest loss %${ip("loss", m.loss)}</label>
    <h3>Farm-gate price (₱/kg)</h3><div class="btnrow"><button class="btn line" data-pre="0">Conservative</button><button class="btn line" data-pre="1">Base</button><button class="btn line" data-pre="2">Export premium</button></div>${CLS.map((c, i) => `<label>Class ${c}${ip("price." + i, m.price[i], "0.5")}</label>`).join("")}
    <h3>Costs per hectare (₱)</h3>${Object.keys(m.costs).map((k) => `<label>${k}${ip("costs." + k, m.costs[k], 500)}</label>`).join("")}<label>Sucker price (₱ each)${ip("matUnit", m.matUnit, "0.1")}</label><label>Harvest &amp; packing (₱/kg)${ip("harvestKg", m.harvestKg, "0.1")}</label>
    <h3>Transport</h3><label>Haul rate (₱ per ton-km)${ip("rate", m.rate)}</label><p class="note2">Starting values come from published statistics (see the sources at the bottom of the page). Replace them with your own contract prices and costs.</p><div class="btnrow"><button class="btn line" id="mkReset">Reset to defaults</button></div>`;
  $$("#mkIn [data-pre]").forEach((bt) => (bt.onclick = () => { CFG.mk.price = [...PRESETS[+bt.dataset.pre]]; saveCfg(); renderMarketInputs(); renderMarketOut(); }));
  $("mkReset").onclick = () => { CFG = merge(structuredClone(DEF), {}); saveCfg(); renderCfg(); renderMarketInputs(); recalc(); };
  $$("#mkIn input").forEach((el) => (el.oninput = () => { const ks = el.dataset.k.split("."), v = +el.value; ks.length === 1 ? (CFG.mk[ks[0]] = v) : (CFG.mk[ks[0]][ks[1]] = v); saveCfg(); renderMarketOut(); }));
}
function renderMarketOut() {
  if (!S.stats || !S.cur) return; const b = econBase(), e = econ(b), m = CFG.mk, cyc = Math.round(b.cycle), ann = e.roi * 12 / b.cycle, bePrice = b.fixed / Math.max(1, b.totalKg) + b.varKg, avgP = e.rev / Math.max(1, b.totalKg);
  const tc = (s) => (s ? "background:#e1f3bd" : "background:#ffd8cf"), ranks = S.places.map((p, i) => ({ p, i, net: avgP - p.km * 1.3 * m.rate / 1000 })).sort((a, c) => c.net - a.net);
  const costRows = Object.entries(b.lines).concat([["Harvest, packing & haul", b.varKg * b.totalKg]]), costTot = costRows.reduce((a, [, v]) => a + v, 0), COL = ["#0b4a43", "#3f9a4a", "#a8d94f", "#ffc531", "#ff8a3d", "#ff6b4a", "#5fa8c4", "#8c6bb1", "#999"];
  const grid = [-20, -10, 0, 10, 20].map((pm) => `<tr><th>${pm > 0 ? "+" : ""}${pm}% price</th>${[-20, -10, 0, 10, 20].map((ym) => { const r = econ(b, 1 + pm / 100, 1 + ym / 100); return `<td style="${tc(r.profit > 0)}">${fmt(r.roi)}%</td>`; }).join("")}</tr>`).join("");
  const M = Math.ceil(b.cycle), fm = S.model && S.model.force > 0 ? Math.round(S.model.force / 30.4) : Math.round(M * 0.65), flow = Array.from({ length: M + 1 }, () => 0), L = b.lines;
  flow[0] -= (L["Land preparation"] || 0) + (L["Planting material (suckers)"] || 0); for (let i = 1; i <= fm; i++) flow[i] -= (L["Fertilizer"] || 0) / fm; flow[Math.min(M, fm)] -= L["Forcing & growth regulators"] || 0;
  for (let i = 0; i <= M; i++) flow[i] -= ((L["Pest & weed control"] || 0) + (L["Labor (cultural)"] || 0) + (L["Irrigation / water"] || 0) + (L["Overhead & financing"] || 0)) / (M + 1);
  flow[M] += e.rev - b.varKg * b.totalKg; let cum = 0; const cumul = flow.map((v) => (cum += v)), mn = Math.min(...cumul, 0), mx = Math.max(...cumul, 1), X = (i) => 10 + i * 280 / M, Y = (v) => 100 - (v - mn) / (mx - mn) * 90, be = cumul.findIndex((v, i) => i > 0 && v >= 0);
  const stackRow = (arr, cols) => { const t = arr.reduce((a, v) => a + v, 0) || 1; return `<div class="stack">${arr.map((v, i) => `<i style="width:${v / t * 100}%;background:${cols[i]}" title="${fmt(v / t * 100)}%"></i>`).join("")}</div>`; };
  const bm = { cost: 94927, kg: 41604, price: 10.89, net: 358143 }, ypha = b.totalKg / 1000 / b.area;
  const chk = [[ypha <= 66 ? "ok" : "med", `Yield ${fmt(ypha, 1)} t/ha`, `DA projects about 44 t/ha nationally (PSA 2019: 41.6). ${ypha <= 66 ? "Plausible for a well-run plantation." : "Well above average: check fruit weight, density and losses."}`],
    [avgP <= 28 ? "ok" : "med", `Average price ₱${fmt(avgP, 1)}/kg`, "PSA-implied Northern Mindanao farmgate is about ₱18.8/kg (Q1 2025). Processing grade ₱15–25, export grade ₱30–50 at packhouse."],
    [e.roi <= 450 ? "ok" : "med", `ROI ${fmt(e.roi)}% per crop cycle`, e.roi <= 450 ? "Close to PSA's national figure (about 377% for 2019)." : "Unusually high. Re-check prices and costs."],
    ["info", "Plantation costs are 2013 figures", "The Del Monte-scale cost study is from 2013 (₱191,763/ha). Today's costs are probably higher, so edit the cost lines."]];
  const reality = `<div class="card"><h3>Reality check <small>benchmarks checked 14 Nov 2026</small></h3><div class="list">${chk.map(([sv, t, d]) => `<div class="sev-${sv}"><b>${t}</b><small>${d}</small></div>`).join("")}</div></div>`;
  $("mkOut").innerHTML = `<div class="mkk"><div class="card kpi t-sun"><span>Total plantation cost</span><b class="num">${peso(e.cost)}</b><small>${peso(e.cost / b.area)} per ha</small></div><div class="card kpi t-lime"><span>Projected revenue</span><b class="num">${peso(e.rev)}</b><small>${fmt(b.totalKg / 1000, 1)} t sellable · ${fmt(b.totalKg / 1000 / b.area, 1)} t/ha</small></div>
    <div class="card kpi t-sky"><span>Net profit</span><b class="num">${peso(e.profit)}</b><small>${peso(e.profit / b.area)} per ha</small></div><div class="card kpi t-coral"><span>ROI per crop cycle</span><b class="num">${fmt(e.roi)}%</b><small>${cyc}-month cycle · ${fmt(ann)}% per year</small></div></div>
    ${reality}<div class="card"><h3>Revenue by quality class <small>${fmt(b.area, 2)} ha · ${fmt(b.plants)} bearing plants (${S.hSrc})</small></h3>${stackRow(b.kg.map((v, i) => v * b.price[i]), CCOL)}
      <table><tr><th>Class</th><th class="n">Tons</th><th class="n">₱/kg</th><th class="n">Revenue</th></tr>${CLS.map((c, i) => `<tr><td><span class="cl" style="background:${CCOL[i]}"></span>${c}</td><td class="n">${fmt(b.kg[i] / 1000, 1)}</td><td class="n">${b.price[i]}</td><td class="n">${peso(b.kg[i] * b.price[i])}</td></tr>`).join("")}</table></div>
    <div class="card"><h3>Where the money goes</h3>${stackRow(costRows.map(([, v]) => v), COL)}<table>${costRows.map(([k, v], i) => `<tr><td><span class="cl" style="background:${COL[i % 9]}"></span>${k}</td><td class="n">${peso(v)}</td><td class="n">${fmt(v / costTot * 100)}%</td></tr>`).join("")}</table><p class="note2">Break-even farm-gate price: <b>${peso(bePrice)}/kg</b> · current average realised price: <b>${peso(avgP)}/kg</b></p></div>
    <div class="card"><h3>Cash flow over the crop cycle <small>${be > 0 ? "break-even in month " + be : "no break-even inside the cycle"}</small></h3><svg viewBox="0 0 300 115" style="width:100%"><line x1="10" x2="290" y1="${Y(0)}" y2="${Y(0)}" stroke="#bbb" stroke-dasharray="3"/><polyline fill="none" stroke="#0b4a43" stroke-width="2.5" points="${cumul.map((v, i) => `${X(i)},${Y(v)}`).join(" ")}"/><text x="10" y="112" font-size="8">month 0</text><text x="250" y="112" font-size="8">month ${M}</text></svg></div>
    <div class="card"><h3>ROI sensitivity <small>price change (rows) × yield change (columns)</small></h3><table class="sens"><tr><th></th>${[-20, -10, 0, 10, 20].map((y) => `<th>${y > 0 ? "+" : ""}${y}% yield</th>`).join("")}</tr>${grid}</table></div>
    <div class="card"><h3>Where to sell <small>nearby buyers from OpenStreetMap · road distance ≈ 1.3 × straight line</small></h3>
      <table><tr><th></th><th>Outlet</th><th>Type</th><th class="n">km</th><th class="n">Haul ₱/ton</th></tr><tr><td><input type="radio" name="outlet" value="farm" ${m.outlet === "farm" ? "checked" : ""}></td><td>Farm-gate (buyer collects)</td><td>Contract / trader</td><td class="n">0</td><td class="n">0</td></tr>
      ${ranks.map(({ p, i }) => `<tr><td><input type="radio" name="outlet" value="${i}" ${String(m.outlet) === String(i) ? "checked" : ""}></td><td>${p.name}</td><td>${p.kind}</td><td class="n">${p.km}</td><td class="n">${fmt(p.km * 1.3 * m.rate)}</td></tr>`).join("") || '<tr><td colspan="5" class="mute">No mapped buyers found near this field in OpenStreetMap. Use farm-gate, or enter your own buyer.</td></tr>'}</table>
      <p class="note2">Listed nearest first by net price after hauling. Prices per class are the same for every outlet; set them to what each buyer actually offers. For official prices see PSA farmgate price reports and DA price monitoring.</p></div>
    <div class="card"><h3>Benchmark vs national average <small>PSA 2019</small></h3><table><tr><th></th><th class="n">Your projection</th><th class="n">PSA national avg</th></tr><tr><td>Yield (t/ha)</td><td class="n">${fmt(b.totalKg / 1000 / b.area, 1)}</td><td class="n">44 (DA) · 41.6 (PSA 2019)</td></tr><tr><td>Farm-gate price (₱/kg)</td><td class="n">${fmt(avgP, 2)}</td><td class="n">18.8 (Region 10, 2025) · 10.89 (2019)</td></tr><tr><td>Cost (₱/ha)</td><td class="n">${fmt(e.cost / b.area)}</td><td class="n">${fmt(bm.cost)}</td></tr><tr><td>Net return (₱/ha)</td><td class="n">${fmt(e.profit / b.area)}</td><td class="n">${fmt(bm.net)}</td></tr></table>
      <p class="note2">Sources: PSA Region 10 Q1 2025 pineapple value (₱7.13 billion) divided by volume (378,682 MT) gives about ₱18.8/kg (my calculation); IndexBox 2026 market report for grade price ranges; Department of Agriculture 2025 yield projection (about 44 t/ha); PSA cost-and-returns 2019 (via Manila Bulletin); UPLB study of the Del Monte plantation (2013). The largest regional processing buyer is the Del Monte complex in Bugo, Cagayan de Oro. Projections are model estimates, not guarantees.</p></div>`;
  $$("input[name=outlet]").forEach((r) => (r.onchange = () => { CFG.mk.outlet = r.value; saveCfg(); renderMarketOut(); }));
}
let mkBuilt = null; function renderMarket() { if (mkBuilt !== S.cur?.id) { renderMarketInputs(); mkBuilt = S.cur?.id; } renderMarketOut(); }

// ---- per-pineapple pinpoint map (2D) ----
const PM = { scale: 3, ox: 0, oy: 0, layer: "class", show: [1, 1, 1, 1], sel: -1, idx: new Map(), fit: false, drag: null };
const pmReset = () => { PM.sel = -1; PM.fit = false; PM.ox = PM.oy = 0; PM.idx = new Map(); };
function pmIndex() { PM.idx = new Map(); const d = S.data; for (let i = 0; i < d.x.length; i++) { const k = Math.floor(d.x[i] / 4) + "," + Math.floor(d.y[i] / 4); (PM.idx.get(k) || PM.idx.set(k, []).get(k)).push(i); } }
const HC = Array.from({ length: 21 }, (_, i) => `hsl(${i * 6},75%,48%)`), hcol = (h) => HC[Math.round(clamp(h) * 20)];
const ndcol = (v) => `hsl(${Math.round(clamp((v - 0.2) / 0.65) * 110)},70%,42%)`;
function pmFit() { const cv = $("cvHealth"); PM.scale = Math.min(cv.width, cv.height) / (2 * S.rf * 1.08); PM.ox = PM.oy = 0; PM.fit = true; }
function pmDraw() {
  const cv = $("cvHealth"); if (!S.data || !S.reg || !cv.clientWidth) return;
  if (cv.width !== cv.clientWidth || cv.height !== cv.clientHeight) { cv.width = cv.clientWidth; cv.height = cv.clientHeight; PM.fit = false; } if (!PM.fit) pmFit();
  const c = cv.getContext("2d"), W = cv.width, H = cv.height, s = PM.scale, d = S.data, reg = S.reg, tgt = tgtW(), r = S.cur.radius; c.fillStyle = "#10302b"; c.fillRect(0, 0, W, H);
  if (PM.layer === "ndvi" && S.ndvi?.grid) { const n = S.ndvi.n, cs = 2 * r / n * s; S.ndvi.grid.forEach((row, i) => row.forEach((v, j) => { if (v == null) return; c.fillStyle = ndcol(v); c.fillRect(W / 2 + PM.ox + (-r + j * 2 * r / n) * s, H / 2 + PM.oy - (r - i * 2 * r / n) * s, cs + 0.6, cs + 0.6); })); }
  const sz = Math.max(1.5, Math.min(10, s * 0.35)); let last = "";
  for (let i = 0; i < d.x.length; i++) { const cl = reg.cls[i]; if (!PM.show[cl]) continue; const sx = W / 2 + PM.ox + d.x[i] * s, sy = H / 2 + PM.oy - d.y[i] * s; if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
    const f = PM.layer === "class" ? CCOL[cl] : PM.layer === "health" ? hcol(d.h[i]) : PM.layer === "weight" ? `hsl(${Math.round(clamp((reg.w[i] / tgt - 0.4) / 0.8) * 120)},75%,48%)` : "rgba(255,255,255,.55)"; if (f !== last) { c.fillStyle = f; last = f; }
    if (sz > 3.5) { c.beginPath(); c.arc(sx, sy, sz / 2, 0, 6.283); c.fill(); } else c.fillRect(sx - sz / 2, sy - sz / 2, sz, sz); }
  if (PM.sel >= 0) { const sx = W / 2 + PM.ox + d.x[PM.sel] * s, sy = H / 2 + PM.oy - d.y[PM.sel] * s; c.strokeStyle = "#fff"; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, Math.max(8, sz), 0, 6.283); c.stroke(); }
}
let pmRaf; const pmQueue = () => { cancelAnimationFrame(pmRaf); pmRaf = requestAnimationFrame(pmDraw); };
function pmPick(mx, my) {
  const cv = $("cvHealth"), s = PM.scale, d = S.data, wx = (mx - cv.width / 2 - PM.ox) / s, wy = -(my - cv.height / 2 - PM.oy) / s, rr = Math.max(0.4, 14 / s), cx = Math.floor(wx / 4), cy = Math.floor(wy / 4), reach = Math.ceil(rr / 4); let best = -1, bd = rr * rr;
  for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) for (const i of PM.idx.get(cx + a + "," + (cy + b)) || []) { if (!PM.show[S.reg.cls[i]]) continue; const q = (d.x[i] - wx) ** 2 + (d.y[i] - wy) ** 2; if (q < bd) { bd = q; best = i; } }
  return best;
}
function showPineapple(i) {
  if (i == null || i < 0) return; PM.sel = i; const d = S.data, r = S.reg, k = r.cls[i], lat = S.cur.lat + d.y[i] / 111320, lon = S.cur.lon + d.x[i] / (111320 * Math.cos(S.cur.lat * Math.PI / 180)), g = S.model ? growth(S.dap).fruit : 0, nd = S.ndvi?.grid ? ndAt((d.x[i] + S.cur.radius) / (2 * S.cur.radius) * (S.ndvi.n - 1), (S.cur.radius - d.y[i]) / (2 * S.cur.radius) * (S.ndvi.n - 1)) : null;
  $("pmInfo").innerHTML = `<div style="border-left:6px solid ${CCOL[k]}"><b>Pineapple #${i} · Class ${CLS[k]}</b><small>${lat.toFixed(6)}, ${lon.toFixed(6)} · ${ZN[(d.x[i] > 0 ? 1 : 0) + (d.y[i] < 0 ? 2 : 0)]} zone</small></div>
    <div><small>Estimated weight at harvest</small><b>${r.w[i].toFixed(2)} kg</b> <small>now ≈ ${(r.w[i] * g).toFixed(2)} kg · volume ≈ ${r.vol[i].toFixed(2)} L</small></div><div><small>Plant health (${S.hSrc})</small><b>${Math.round(d.h[i] * 100)}%</b>${nd != null ? `<small>satellite NDVI here: ${nd.toFixed(2)}</small>` : ""}</div>
    <div><small>Suggested action</small>${d.h[i] < 0.55 ? "Inspect this spot: check moisture, roots and nutrition." : TIPS[S.model ? stageOf(S.dap) : "Vegetative"]}</div><div class="note2">Position and class are modelled estimates until measured by camera or drone.</div>`; pmQueue();
}
(() => { const cv = $("cvHealth");
  cv.addEventListener("wheel", (e) => { e.preventDefault(); if (!S.data) return; const r = cv.getBoundingClientRect(), mx = e.clientX - r.left - cv.width / 2, my = e.clientY - r.top - cv.height / 2, k = e.deltaY < 0 ? 1.25 : 0.8, ns = clamp(PM.scale * k, 0.5, 90), kk = ns / PM.scale; PM.ox = mx - (mx - PM.ox) * kk; PM.oy = my - (my - PM.oy) * kk; PM.scale = ns; pmQueue(); }, { passive: false });
  cv.addEventListener("pointerdown", (e) => { PM.drag = { x: e.clientX, y: e.clientY, ox: PM.ox, oy: PM.oy, moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (!PM.drag) return; const dx = e.clientX - PM.drag.x, dy = e.clientY - PM.drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) PM.drag.moved = true; PM.ox = PM.drag.ox + dx; PM.oy = PM.drag.oy + dy; pmQueue(); });
  cv.addEventListener("pointerup", (e) => { if (PM.drag && !PM.drag.moved && S.data) { const r = cv.getBoundingClientRect(); showPineapple(pmPick(e.clientX - r.left, e.clientY - r.top)); } PM.drag = null; });
  const z = (k) => () => { PM.scale = clamp(PM.scale * k, 0.5, 90); pmQueue(); }; $("zIn").onclick = z(1.4); $("zOut").onclick = z(0.7); $("zFit").onclick = () => { PM.fit = false; pmQueue(); }; })();
$$("input[name=lay]").forEach((r) => (r.onchange = () => { PM.layer = r.value; pmQueue(); }));
function renderHealthSide() {
  if (!S.stats) return; const st = S.stats, tot = Math.max(1, st.kg.reduce((a, b) => a + b, 0));
  $("legend").innerHTML = CLS.map((c, i) => `<label><input type="checkbox" data-c="${i}" ${PM.show[i] ? "checked" : ""}><span class="cl" style="background:${CCOL[i]}"></span>Class ${c} · ${fmt(st.c[i] / st.n * 100)}%</label>`).join("");
  $$("#legend input").forEach((el) => (el.onchange = () => { PM.show[+el.dataset.c] = el.checked ? 1 : 0; pmQueue(); }));
  const b = econBase();
  $("quality").innerHTML = CLS.map((c, i) => `<div>Class ${c}: <b>${fmt(st.c[i] / st.n * 100)}%</b> · ${fmt(b.kg[i] / 1000, 1)} t</div><div class="bar"><i style="width:${st.c[i] / st.n * 100}%;background:${CCOL[i]}"></i></div>`).join("") + `<p class="note2">Whole-field estimate: ${fmt(b.plants)} bearing plants · ${fmt(b.totalKg / 1000, 1)} t. Class rules: A ≥ 85% of target weight and health ≥ 70%; B ≥ 70%; C ≥ 50%; D below.</p>`;
}
function renderNdviInfo(state) {
  const sc = S.ndvi?.scenes || []; $("ndviInfo").innerHTML = state === "loading" ? '<div class="sev-info">Fetching Sentinel-2 scenes…</div>' : S.ndvi
    ? `<div class="sev-ok"><b>Measured: ${S.ndvi.date}</b><small>Mean NDVI ${sc[0]?.mean ?? "–"} · 10 m resolution</small></div>${sc.slice(1).map((x) => `<div><small>${x.date}</small><b>NDVI ${x.mean}</b></div>`).join("")}` : `<div class="sev-med"><b>Using simulated health</b><small>${S.ndviErr || "No satellite data yet"}</small></div>`;
}

// ---- alerts, plan, confidence ----
function alerts() {
  const a = [], z = S.stats.zones, m = S.model; z.forEach((o, i) => { if (o.h < 0.65) a.push({ sev: o.h < 0.5 ? "high" : "med", t: `Stress in ${ZN[i]} zone (${Math.round(o.h * 100)}% health)`, r: "Inspect on foot; check irrigation uniformity and apply foliar nutrients if leaves are yellowing." }); });
  if (m) { const t = S.todayIdx, rain14 = S.wx.slice(Math.max(0, t - 14), t + 1).reduce((x, w) => x + w.rain, 0), next3 = S.wx.slice(t + 1, t + 4).reduce((x, w) => x + w.rain, 0), t7 = S.wx.slice(Math.max(0, t - 6), t + 1), avgT = t7.reduce((x, w) => x + w.t, 0) / t7.length, stg = stageOf(S.dap);
    if (rain14 < 20) a.push({ sev: "med", t: `Dry spell: ${fmt(rain14)} mm in 14 days`, r: "Irrigate 8–10 mm or mulch to keep plants from stalling." });
    if (next3 > 100) a.push({ sev: "high", t: `Heavy rain forecast: ${fmt(next3)} mm in 3 days`, r: "Check drainage, delay fertilizer, watch for root and heart rot." });
    if (avgT < 19) a.push({ sev: "med", t: `Cool week (${avgT.toFixed(1)} °C average)`, r: "Growth slows; the harvest date may move later." });
    if (avgT > 30 && stg === STAGES[3]) a.push({ sev: "med", t: "Hot weather during fruit development", r: "Sunburn risk: protect exposed fruit." }); }
  if (!a.length) a.push({ sev: "ok", t: "No problems detected", r: "Keep the current schedule." }); if (m) a.push({ sev: "info", t: `Stage: ${stageOf(S.dap)}`, r: TIPS[stageOf(S.dap)] }); return a;
}
const arow = (a) => `<div class="sev-${a.sev}"><b>${a.t}</b><small>→ ${a.r}</small></div>`;

// ---- phenology page ----
function renderPheno() {
  if (!S.model) { $("fc").innerHTML = '<div class="sev-info">Loading real weather for this field…</div>'; return; } const m = S.model, st = stageOf(S.dap), si = STAGES.indexOf(st), sc = SCEN[S.scen], b = S.stats ? econBase() : null;
  $("timeline").innerHTML = STAGES.map((n, i) => `<div class="${i === si ? "on" : i < si ? "past" : ""}">${n}</div>`).join(""); $("wxSrc").textContent = S.wxSrc;
  $("dapLbl").textContent = `${new Date(S.wx[S.dap].date).toDateString().slice(4)} · ${st}`;
  const tk = (i, l, c) => (i > 0 ? `<i class="${c || ""}" data-l="${l}" style="left:${i / S.max * 100}%"></i>` : ""); $("ticks").innerHTML = tk(m.force, "Flower") + tk(m.fruit, "Fruit") + tk(m.harv, "Harvest") + tk(S.todayIdx, "", "t");
  const dh = m.harv > 0 ? m.harv - S.todayIdx : null;
  $("fc").innerHTML = [["Harvest date", dateAt(m.harv) + (S.early > 0 && S.late > 0 ? ` <small>(${dateAt(S.early)} – ${dateAt(S.late)})</small>` : "")], ["Days to harvest (from today)", dh == null ? "beyond horizon" : Math.max(0, dh)], ["Stage today", stageOf(S.todayIdx)],
    ["Heat units", `${fmt(m.gdd[S.dap])} of ${fmt(m.gH)} GDD`], ["Est. yield", b ? fmt(b.totalKg / 1000 / b.area, 1) + " t/ha" : "–"], ["Avg fruit weight", b ? (b.totalKg / (b.plants * (1 - CFG.mk.loss / 100)) ).toFixed(2) + " kg" : "–"]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("");
  const mx = Math.max(...m.gdd), pts = m.gdd.filter((_, i) => i % 6 === 0).map((g, i) => `${i * 6 / (m.gdd.length - 1) * 290 + 5},${112 - g / mx * 100}`).join(" "), X = S.dap / (m.gdd.length - 1) * 290 + 5;
  $("gddChart").innerHTML = `<polyline fill="none" stroke="#3f9a4a" stroke-width="2.5" points="${pts}"/><line x1="5" x2="295" y1="${112 - m.gF / mx * 100}" y2="${112 - m.gF / mx * 100}" stroke="#ffc531" stroke-dasharray="3"/><line x1="5" x2="295" y1="${112 - m.gH / mx * 100}" y2="${112 - m.gH / mx * 100}" stroke="#ff6b4a" stroke-dasharray="3"/><line x1="${X}" x2="${X}" y1="5" y2="115" stroke="#0b4a43"/><text x="8" y="${108 - m.gF / mx * 100}" font-size="8" fill="#b9831a">forcing</text><text x="8" y="${108 - m.gH / mx * 100}" font-size="8" fill="#d6452a">harvest</text>`;
}
function renderCfg() {
  const f = [["plant", "Planting date", "date"], ["force", "Forcing date (optional)", "date"], ["base", "Base temperature °C", "number"], ["gddForce", "Heat units to forcing", "number"], ["gddHarv", "Heat units forcing → harvest", "number"], ["target", "Target fruit weight kg", "number"], ["calib", "Measured avg weight kg (calibrate)", "number"]];
  $("cfg").innerHTML = f.map(([k, l, t]) => `<label>${l}<input data-c="${k}" type="${t}" step="any" value="${CFG[k] ?? ""}"></label>`).join("") + '<p class="note2">Defaults are starting values for pineapple. Calibrate them with your own planting and forcing records and measured fruit weights.</p>';
  $$("#cfg input").forEach((el) => (el.onchange = () => { const k = el.dataset.c; CFG[k] = el.type === "number" ? +el.value : el.value; saveCfg(); if (k === "plant") { S.dap = null; loadWeatherSeries(); } else recalc(); }));
}
function setDap(d) { S.dap = d; $("dap").value = d; renderPheno(); cancelAnimationFrame(raf2); raf2 = requestAnimationFrame(() => { setStage(S.dap); if (S.cur) setSun(S.cur.lat, new Date(S.wx[S.dap].date)); renderAll(); }); }
let raf2; $("dap").oninput = (e) => setDap(+e.target.value); $("today").onclick = () => setDap(Math.min(S.todayIdx, S.max)); $("scen").onchange = (e) => { S.scen = e.target.value; recalc(); };
$("play").onclick = () => { if (S.play) { clearInterval(S.play); S.play = null; $("play").textContent = "▶"; return; } if (S.dap >= S.max) setDap(0); $("play").textContent = "⏸"; S.play = setInterval(() => { if (S.dap >= S.max) { $("play").click(); return; } setDap(Math.min(S.max, S.dap + 3)); }, 70); };

// ---- dashboard & panels ----
const ring = (p) => { const c = 2 * Math.PI * 30, k = p > 75 ? "#3f9a4a" : p > 55 ? "#e6a912" : "#ff6b4a"; return `<div class="ring"><svg viewBox="0 0 74 74"><circle cx="37" cy="37" r="30" fill="none" stroke="#ffffffaa" stroke-width="8"/><circle cx="37" cy="37" r="30" fill="none" stroke="${k}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c * p / 100} ${c}" transform="rotate(-90 37 37)"/></svg><b class="num">${p}%</b></div>`; };
let lastKey = "";
function renderAll() {
  const has = !!(S.cur && S.stats); $("dashEmpty").hidden = has; $("dashFull").hidden = !has; if (!has) { $("alertCount").textContent = 0; return; }
  const st = S.stats, al = alerts(), real = al.filter((a) => a.sev === "high" || a.sev === "med").length, b = econBase(), e = econ(b), m = S.model, dh = m && m.harv > 0 ? Math.max(0, m.harv - S.todayIdx) : null;
  $("dashTitle").textContent = S.cur.name; $("dashSub").textContent = `${S.cur.lat.toFixed(4)}, ${S.cur.lon.toFixed(4)} · ${S.cur.radius} m radius · ${m ? stageOf(S.dap) + " · " : ""}${fmt(b.plants)} bearing plants (${fmt(b.area, 1)} ha)`;
  $("kHealth").innerHTML = ring(Math.round(st.avg * 100)); $("kHealthSrc").textContent = S.hSrc.startsWith("satellite") ? "measured" : "simulated"; $("alertCount").textContent = real;
  $("kDaysSub").textContent = m && S.early > 0 && S.late > 0 ? `${dateAt(S.early)} – ${dateAt(S.late)}` : m ? "" : "loading weather…"; $("kTonsSub").textContent = `${fmt((st.c[0] + st.c[1]) / st.n * 100)}% Class A–B · ${fmt(b.area, 1)} ha`; $("kRoiSub").textContent = `profit ${peso(e.profit)}`;
  const key = [S.cur.id, dh, Math.round(b.totalKg), Math.round(e.roi), real].join("|"); if (key !== lastKey) { lastKey = key; dh == null ? ($("kDays").textContent = "–") : countTo($("kDays"), dh); countTo($("kTons"), b.totalKg / 1000, " t"); countTo($("kRoi"), e.roi, "%"); }
  $("alertList").innerHTML = $("probList").innerHTML = al.map(arow).join("");
  $("plan").innerHTML = `<table class="mkt"><tr><th>Zone</th><th class="n">Class A</th><th class="n">Est. tons</th><th class="n">Pick order</th></tr>${st.zones.map((z, i) => ({ z, i })).sort((p, q) => q.z.a - p.z.a).map(({ z, i }, k) => `<tr><td>${ZN[i]}</td><td class="n">${fmt(z.a)}%</td><td class="n">${fmt(z.kg * b.plants / st.n / 1000 * (1 - CFG.mk.loss / 100), 1)}</td><td class="n">${k + 1}</td></tr>`).join("")}</table><p class="note2">Harvest zones with the highest Class A share first. Harvest window: ${m ? dateAt(S.early) + " – " + dateAt(S.late) : "pending weather data"}.</p>`;
  $("conf").innerHTML = [["Terrain & imagery", "Measured: AWS elevation tiles + Esri satellite", "ok"], ["Weather & forecast", S.wxSrc || "loading…", S.wxSrc.startsWith("FALLBACK") ? "med" : "ok"], ["Crop vigour", S.hSrc.startsWith("satellite") ? "Measured: " + S.hSrc : "Simulated (satellite data not available yet)", S.hSrc.startsWith("satellite") ? "ok" : "med"],
    ["Growth stage & harvest date", "Modelled from heat units (thresholds are defaults to calibrate)", "info"], ["Each pineapple's position, class and weight", "Modelled on the satellite-detected crop; not individually measured", "info"], ["Prices & costs", "Editable assumptions anchored to PSA and Del Monte plantation data", "info"]].map(([a, b2, s]) => `<div class="sev-${s}"><b>${a}</b><small>${b2}</small></div>`).join("");
  $("zones").innerHTML = st.zones.map((z, i) => `<div class="sev-${z.h < 0.5 ? "high" : z.h < 0.65 ? "med" : "ok"}"><b>${ZN[i]}</b><small>${Math.round(z.h * 100)}% health · ${fmt(z.a)}% Class A</small></div>`).join("");
  const w = S.live, soil = w?.soil != null ? (w.soil * 100).toFixed(0) + " %" : "n/a";
  $("live").innerHTML = w ? [["Temperature", w.t + " °C"], ["Humidity", w.rh + " %"], ["Rain now", w.p + " mm"], ["Soil moisture (model)", soil], ["Crop vigour (NDVI mean)", S.ndvi ? S.ndvi.scenes[0].mean : "simulated"]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("") : '<div class="mute">Weather unavailable</div>';
  $("weather").innerHTML = w ? w.daily.time.map((t, i) => `<div><small>${new Date(t).toDateString().slice(0, 10)}</small><br><b>${w.daily.temperature_2m_max[i]}°</b><br><small>${w.daily.precipitation_sum[i]} mm</small></div>`).join("") : '<span class="mute">Weather unavailable</span>';
}
function drawDash() { const cv = $("cvDash"); if (!S.data || !S.reg || !cv.clientWidth) return; const W = (cv.width = cv.clientWidth), H = (cv.height = cv.clientHeight), s = Math.min(W, H) / (2 * S.rf * 1.05), c = cv.getContext("2d"), d = S.data;
  c.fillStyle = "#10302b"; c.fillRect(0, 0, W, H); const step = Math.max(1, Math.floor(d.x.length / 40000)); for (let i = 0; i < d.x.length; i += step) { c.fillStyle = CCOL[S.reg.cls[i]]; c.fillRect(W / 2 + d.x[i] * s - 1, H / 2 - d.y[i] * s - 1, 2.2, 2.2); } }
function redraw() {
  if (!S.data || !S.stats) { renderAll(); return; } const vis2 = (id) => !$(id).hidden;
  if (vis2("phenology")) { renderPheno(); renderWxBar(); } renderAll(); if (vis2("dashboard")) drawDash(); if (vis2("health")) { renderHealthSide(); renderNdviInfo(); pmQueue(); } if (vis2("market")) renderMarket();
}

// ---- viewer controls, inspector, exports ----
$$(".vbtn[data-view]").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$("tPlants").onchange = (e) => setVisible("plants", e.target.checked); $("tFruit").onchange = (e) => setVisible("fruit", e.target.checked); $("tObjects").onchange = (e) => setVisible("objects", e.target.checked);
$("colorMode").onchange = (e) => setColorMode(e.target.value); $("detail").onchange = (e) => setDetail(+e.target.value);
$("snap").onclick = () => { const a = document.createElement("a"); a.href = snapshot(); a.download = `${S.cur?.name || "twin"}.png`; a.click(); };
$("view3d").onclick = () => { $("colorMode").value = "class"; setColorMode("class"); location.hash = "#twin"; };
setPickHandler((i) => { if (!S.reg) return; const d = S.data, k = S.reg.cls[i];
  $("inspect").innerHTML = `<div style="border-left:6px solid ${CCOL[k]}"><b>Pineapple #${i} · Class ${CLS[k]}</b><small>${ZN[(d.x[i] > 0 ? 1 : 0) + (d.y[i] < 0 ? 2 : 0)]} zone</small></div><div><small>Est. weight at harvest</small><b>${S.reg.w[i].toFixed(2)} kg · ${S.reg.vol[i].toFixed(2)} L</b></div><div><small>Health (${S.hSrc})</small><b>${Math.round(d.h[i] * 100)}%</b></div>`; showPineapple(i); });
const dl = (name, text, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
const ll = (i) => [S.cur.lat + S.data.y[i] / 111320, S.cur.lon + S.data.x[i] / (111320 * Math.cos(S.cur.lat * Math.PI / 180))];
$("expCsv").onclick = () => { const r = ["id,lat,lon,class,weight_kg,volume_l,health"]; for (let i = 0; i < S.data.x.length; i++) { const [la, lo] = ll(i); r.push([i, la.toFixed(7), lo.toFixed(7), CLS[S.reg.cls[i]], S.reg.w[i].toFixed(3), S.reg.vol[i].toFixed(3), S.data.h[i].toFixed(3)].join(",")); } dl("pineapples.csv", r.join("\n"), "text/csv"); };
$("expGeo").onclick = () => dl("pineapples.geojson", JSON.stringify({ type: "FeatureCollection", features: Array.from(S.data.x, (_, i) => { const [la, lo] = ll(i); return { type: "Feature", geometry: { type: "Point", coordinates: [+lo.toFixed(7), +la.toFixed(7)] }, properties: { id: i, class: CLS[S.reg.cls[i]], weight_kg: +S.reg.w[i].toFixed(2), health: +S.data.h[i].toFixed(2) } }; }) }), "application/geo+json");
$("csv").onclick = () => { const st = S.stats, b = econBase(), e = econ(b), r = [["metric", "value"], ["field", S.cur.name], ["health_source", S.hSrc], ["avg_health_pct", (st.avg * 100).toFixed(1)], ...CLS.map((c, i) => [`class_${c}_pct`, (st.c[i] / st.n * 100).toFixed(1)]), ["bearing_plants", Math.round(b.plants)], ["est_tons", (b.totalKg / 1000).toFixed(1)], ["total_cost_php", Math.round(e.cost)], ["revenue_php", Math.round(e.rev)], ["profit_php", Math.round(e.profit)], ["roi_pct", e.roi.toFixed(1)], ["note", "modelled estimates; prices and costs are editable assumptions"]]; dl("pinetwin_report.csv", r.map((x) => x.join(",")).join("\n"), "text/csv"); };

// ---- start ----
renderCfg(); $("cfgBtn").onclick = () => $("cfgDlg").showModal(); $("cfgClose").onclick = () => $("cfgDlg").close(); setInterval(() => { if (S.cur) loadLive(); }, 600000); route(); window.__ptBooted = true;
(async () => { await loadFields(); const id = localStorage.getItem("pt_cur"); if (id && S.fields.some((f) => f.id === id)) await openField(id); else if (S.fields[0]) await openField(S.fields[0].id); route(); })();