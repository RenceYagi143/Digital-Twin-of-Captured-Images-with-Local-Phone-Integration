import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* ===================== SIM (simulated crop model; swap for real rover/YOLO data) ===================== */
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const sim = {
  STAGES: [["Planting", 0], ["Vegetative", 30], ["Flower induction", 270], ["Fruit development", 330], ["Harvest", 450]], HARVEST_DAP: 450,
  stageOf(d) { return this.STAGES.reduce((s, x) => (d >= x[1] ? x : s), this.STAGES[0])[0]; },
  healthAt(x, y, r) {
    const k = r / 400; let h = 0.82 + 0.1 * Math.sin(x * 0.04 / k) * Math.cos(y * 0.033 / k) + 0.05 * Math.sin((x + y) * 0.09 / k);
    h -= 0.5 * Math.exp(-((x - 0.45 * r) ** 2 + (y + 0.25 * r) ** 2) / (2 * (0.22 * r) ** 2));
    h -= 0.25 * Math.exp(-((x + 0.5 * r) ** 2 + (y - 0.4 * r) ** 2) / (2 * (0.18 * r) ** 2)); return clamp(h);
  },
  classOf: (h) => (h >= 0.75 ? "A" : h >= 0.55 ? "B" : "C"), forecast: (h) => clamp(h - 0.16 * (1 - h)),
  healthColor: (h) => `hsl(${Math.round(h * 120)},70%,45%)`, classColor(h) { return { A: "#7cc242", B: "#ffc531", C: "#ff6b4a" }[this.classOf(h)]; },
  growth: (d) => ({ plant: clamp(0.25 + 0.75 * d / 220), fruit: clamp((d - 300) / 150), ripe: clamp((d - 420) / 60) }),
};

/* ===================== 3D VIEWER ===================== */
const vbox = document.getElementById("viewbox"), vel = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio); renderer.outputColorSpace = THREE.SRGBColorSpace; vel.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfe6f2);
const camera = new THREE.PerspectiveCamera(50, 1, 0.2, 20000);
const controls = new OrbitControls(camera, renderer.domElement); controls.maxPolarAngle = Math.PI * 0.49;
scene.add(new THREE.HemisphereLight(0xffffff, 0x667766, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(300, 500, 200); scene.add(sun);
function vresize() { const w = vel.clientWidth, h = vel.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(vresize).observe(vel);
const attach = (slot) => { slot.appendChild(vbox); vresize(); };

function leafGeo(s) {
  const seg = 3, L = 0.8 * s, pos = [], idx = []; let x = 0, y = 0, a = 0.3;
  for (let i = 0; i <= seg; i++) { const w = 0.075 * Math.pow(1 - i / seg, 0.7) + 0.004; pos.push(x, y, -w, x, y, w); a += 0.38; x += Math.sin(a) * L / seg; y += Math.cos(a) * L / seg; }
  for (let i = 0; i < seg; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const PG = mergeGeometries(Array.from({ length: 8 }, (_, i) => { const g = leafGeo(0.85 + 0.15 * ((i * 5) % 7) / 6); g.rotateY(i * 2.399); return g; }));
const FG = new THREE.SphereGeometry(0.1, 8, 6); FG.scale(1, 1.55, 1); FG.translate(0, 0.2, 0);
const CG = mergeGeometries(Array.from({ length: 6 }, (_, i) => { const g = new THREE.ConeGeometry(0.028, 0.2, 3, 1, true); g.translate(0, 0.1, 0); g.rotateZ(i ? 0.35 : 0); g.rotateY(i * 1.05); g.translate(0, 0.34, 0); return g; }));
const tcv = document.createElement("canvas"); tcv.width = tcv.height = 64;
{ const c = tcv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, 64, 64); c.strokeStyle = "#8d8d8d"; c.lineWidth = 3;
  for (let i = -64; i < 128; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 64, 64); c.moveTo(i + 64, 0); c.lineTo(i, 64); c.stroke(); } }
const TEX = new THREE.CanvasTexture(tcv); TEX.wrapS = TEX.wrapT = THREE.RepeatWrapping; TEX.repeat.set(3, 2); TEX.colorSpace = THREE.SRGBColorSpace;

let current, leaves, fruit, crown, vdata, vinfo, sel = [], stride = 2, vdap = 200, stressOn = false;
const vis = { plants: true, fruit: true }, tmp = new THREE.Object3D(), col = new THREE.Color();
const GREEN = new THREE.Color(0x7a9a35), GOLD = new THREE.Color(0xe0a020);
const rnd = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

function build() {
  for (const m of [leaves, fruit, crown]) if (m) { scene.remove(m); m.dispose(); }
  leaves = fruit = crown = null; if (!vdata) return;
  sel = []; for (let i = 0; i < vdata.x.length; i += stride) sel.push(i); const n = sel.length;
  leaves = new THREE.InstancedMesh(PG, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), n);
  fruit = new THREE.InstancedMesh(FG, new THREE.MeshLambertMaterial({ map: TEX }), n);
  crown = new THREE.InstancedMesh(CG, new THREE.MeshLambertMaterial({ color: 0x4f7a2e, side: THREE.DoubleSide }), n);
  for (const m of [leaves, fruit, crown]) { m.frustumCulled = false; scene.add(m); }
  recolor(); setStage(vdap); applyVis();
}
function recolor() {
  if (!leaves) return;
  sel.forEach((i, j) => { const h = vdata.h[i]; stressOn ? col.setHSL(h * 0.33, 0.75, 0.42) : col.setHSL(h < 0.55 ? 0.17 : 0.28, 0.2 + 0.25 * h, 0.27 + 0.1 * rnd(i, 3)); leaves.setColorAt(j, col); });
  leaves.instanceColor.needsUpdate = true;
}
function setStage(d) {
  vdap = d; if (!leaves) return; const g = sim.growth(d), comp = 1 + 0.15 * (stride - 1);
  sel.forEach((i, j) => {
    const h = vdata.h[i]; tmp.position.set(vdata.x[i], vdata.z[i], -vdata.y[i]); tmp.rotation.set(0, rnd(i, 1) * 6.283, 0);
    tmp.scale.setScalar(g.plant * comp * (0.9 + 0.2 * rnd(i, 2)) * (0.75 + 0.25 * h)); tmp.updateMatrix(); leaves.setMatrixAt(j, tmp.matrix);
    const fs = g.fruit > 0 ? g.fruit * (0.55 + 0.45 * h) * (0.9 + 0.2 * rnd(i, 4)) * Math.sqrt(comp) : 0.0001;
    tmp.scale.setScalar(fs); tmp.updateMatrix(); fruit.setMatrixAt(j, tmp.matrix); crown.setMatrixAt(j, tmp.matrix);
    fruit.setColorAt(j, col.copy(GREEN).lerp(GOLD, Math.min(1, g.ripe * (0.8 + 0.4 * rnd(i, 5)))));
  });
  for (const m of [leaves, fruit, crown]) m.instanceMatrix.needsUpdate = true; fruit.instanceColor.needsUpdate = true; leaves.boundingSphere = null;
}
function applyVis() { if (!leaves) return; leaves.visible = vis.plants; fruit.visible = crown.visible = vis.fruit; }
const setStress = (on) => { stressOn = on; recolor(); };
const setDetail = (n) => { stride = n; build(); };
function setVisible(kind, on) {
  if (kind === "plants" || kind === "fruit") { vis[kind] = on; applyVis(); }
  if (kind === "objects" && current) ["buildings", "trees"].forEach((n) => { const o = current.getObjectByName(n); if (o) o.visible = on; });
}
async function loadTwin(url, plantsUrl, radius) {
  if (current) scene.remove(current);
  const g = await new Promise((ok, fail) => new GLTFLoader().load(url + "?t=" + Date.now(), ok, undefined, fail));
  current = g.scene; scene.add(current);
  current.traverse((o) => { if (!o.isMesh) return;
    if (o.material.map) { o.geometry.computeVertexNormals(); o.material = new THREE.MeshLambertMaterial({ map: o.material.map }); } else { o.material.metalness = 0; o.material.roughness = 1; } });
  const b = new THREE.Box3().setFromObject(current), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  const d = await (await fetch(plantsUrl + "?t=" + Date.now())).json();
  vdata = { x: Float32Array.from(d.x), y: Float32Array.from(d.y), z: Float32Array.from(d.z), h: new Float32Array(d.x.length) };
  for (let i = 0; i < vdata.h.length; i++) vdata.h[i] = sim.healthAt(vdata.x[i], vdata.y[i], radius);
  vinfo = { c, d: Math.max(s.x, s.z), top: b.max.y, cz: d.center_z }; build(); setView("close"); return vdata;
}
function setView(mode) {
  if (!vinfo) return; const { c, d, top, cz } = vinfo;
  if (mode === "close") { controls.target.set(0, cz, 0); camera.position.set(14, cz + 8, 18); }
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
  ray.setFromCamera(ptr, camera); const hit = ray.intersectObject(leaves)[0];
  if (hit && hit.instanceId != null) { const i = sel[hit.instanceId]; pickCb({ i, x: vdata.x[i], y: vdata.y[i], h: vdata.h[i] }); }
});
(function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();

/* ===================== APP ===================== */
const $ = (id) => document.getElementById(id), $$ = (s) => [...document.querySelectorAll(s)], sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5, ZN = ["North-west", "North-east", "South-west", "South-east"];
const SCEN = { normal: { d: 0, y: 1, f: 1 }, dry: { d: 12, y: 0.88, f: 0.9 }, fert: { d: -5, y: 1.06, f: 1.05 } };
const TIPS = { Planting: "Keep soil moist and weed-free while plants establish.", Vegetative: "Apply nitrogen and control weeds; scout for mealybug wilt.",
  "Flower induction": "Schedule forcing (e.g. ethephon) at target plant size; avoid water stress.", "Fruit development": "Apply potassium, keep moisture steady and protect fruit from sunburn.", Harvest: "Check fruit colour and Brix; harvest Class A zones first." };
const S = { fields: [], cur: null, data: null, stats: null, rf: 0, weather: null, scen: "normal", job: null, play: null,
  plant: new Date(Date.now() - 200 * DAY).toISOString().slice(0, 10), dap: 200, today: 200 };
const todayDap = () => Math.round((Date.now() - new Date(S.plant)) / DAY);
$("plantDate").value = S.plant; S.today = S.dap = todayDap();
function toast(msg, type = "info") { const t = document.createElement("div"); t.className = "toast " + type; t.textContent = msg; $("toasts").append(t); setTimeout(() => t.remove(), type === "error" ? 9000 : 3500); }
async function api(url, opt) { const r = await fetch(url, opt); let j = null; try { j = await r.json(); } catch {} if (!r.ok) throw new Error(j?.detail || `${r.status} ${r.statusText}`); return j; }
const busy = (on) => $("topbar").classList.toggle("on", on);
function countTo(el, to, suffix = "") { const t0 = performance.now(); (function f(t) { const k = Math.min(1, (t - t0) / 700); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + suffix; if (k < 1) requestAnimationFrame(f); })(t0); }

// ---- routing ----
const pages = ["home", "dashboard", "twin", "phenology", "health", "fields"];
function route(fromNav) {
  let p = pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  if (!S.cur && ["twin", "phenology", "health"].includes(p)) { p = "fields"; if (fromNav === true) toast("Create a field first and this page will fill with its data."); }
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

// ---- fields ----
async function loadFields() {
  try { S.fields = await api("/api/fields"); } catch (e) { S.fields = []; toast("Could not reach the server: " + e.message, "error"); }
  $("fieldSel").hidden = !S.fields.length; $("fieldSel").innerHTML = S.fields.map((f) => `<option value="${f.id}" ${S.cur?.id === f.id ? "selected" : ""}>${f.name}</option>`).join("");
  $("fieldList").innerHTML = S.fields.length ? S.fields.map((f) => `<div class="fcard ${S.cur?.id === f.id ? "on" : ""}"><span><b>${f.name}</b><small>${f.radius} m · ${f.buildings} buildings · ${f.trees} trees</small></span>
    <span><button class="btn deep" data-open="${f.id}">Open</button> <button class="btn line" data-del="${f.id}">✕</button></span></div>`).join("") : '<div class="mute">No saved fields yet.</div>';
  $$("[data-open]").forEach((b) => (b.onclick = async () => { await openField(b.dataset.open); location.hash = "#twin"; }));
  $$("[data-del]").forEach((b) => (b.onclick = async () => { if (!confirm("Delete this field and its 3D twin?")) return;
    try { await api("/api/fields/" + b.dataset.del, { method: "DELETE" }); if (S.cur?.id === b.dataset.del) { S.cur = S.data = S.stats = null; localStorage.removeItem("pt_cur"); } await loadFields(); redraw(); } catch (e) { toast(e.message, "error"); } }));
}
$("fieldSel").onchange = (e) => openField(e.target.value);
async function openField(id) {
  const meta = S.fields.find((f) => f.id === id); if (!meta) return; busy(true);
  try { S.data = await loadTwin(`/storage/fields/${id}/twin.glb`, `/storage/fields/${id}/plants.json`, meta.radius); S.cur = meta; localStorage.setItem("pt_cur", id); setStage(S.dap);
    S.rf = 0; for (const x of S.data.x) S.rf = Math.max(S.rf, Math.abs(x)); computeStats(); $("empty").hidden = true; weather(); await loadFields(); route();
  } catch (e) { toast("Could not load this 3D twin: " + e.message, "error"); console.error(e); }
  busy(false);
}

// ---- analysis (simulated until rover data is connected) ----
function computeStats() {
  const d = S.data, n = d.x.length, c = { A: 0, B: 0, C: 0 }, f = { A: 0, B: 0, C: 0 }, z = [[0, 0], [0, 0], [0, 0], [0, 0]]; let s = 0;
  for (let i = 0; i < n; i++) { const h = d.h[i]; s += h; c[sim.classOf(h)]++; f[sim.classOf(sim.forecast(h))]++; const q = (d.x[i] > 0 ? 1 : 0) + (d.y[i] < 0 ? 2 : 0); z[q][0] += h; z[q][1]++; }
  const pct = (o) => ({ A: o.A / n * 100, B: o.B / n * 100, C: o.C / n * 100 }); S.stats = { avg: s / n, cur: pct(c), fut: pct(f), zones: z.map((a) => (a[1] ? a[0] / a[1] : 0)), n };
}
function drawMap(cv, mode) {
  const d = S.data; if (!d || !cv.clientWidth) return;
  const W = (cv.width = cv.clientWidth), H = (cv.height = cv.clientHeight), sc = Math.min(W, H) / (2 * S.rf * 1.05), c = cv.getContext("2d");
  c.fillStyle = "#10302b"; c.fillRect(0, 0, W, H); const step = Math.max(1, Math.floor(d.x.length / 40000));
  for (let i = 0; i < d.x.length; i += step) { const h = mode === "forecast" ? sim.forecast(d.h[i]) : d.h[i]; c.fillStyle = mode === "health" ? sim.healthColor(h) : sim.classColor(h); c.fillRect(W / 2 + d.x[i] * sc - 1, H / 2 - d.y[i] * sc - 1, 2.2, 2.2); }
  c.strokeStyle = "#fff"; c.setLineDash([6, 5]); c.lineWidth = 1.4; c.beginPath();
  for (let k = -5; k <= 5; k++) { const x = k * S.rf / 5.5, ch = Math.sqrt(Math.max(0, S.rf ** 2 - x ** 2)) * (k % 2 ? 1 : -1);
    c.moveTo(W / 2 + x * sc, H / 2 + ch * sc); c.lineTo(W / 2 + x * sc, H / 2 - ch * sc); if (k < 5) c.lineTo(W / 2 + (x + S.rf / 5.5) * sc, H / 2 - ch * sc); }
  c.stroke(); c.setLineDash([]);
}
const layer = () => $$("input[name=lay]").find((r) => r.checked).value;
function alerts() {
  const st = S.stats, stage = sim.stageOf(S.dap), w = S.weather, a = [];
  st.zones.forEach((h, i) => { if (h < 0.65) a.push({ sev: h < 0.5 ? "high" : "med", t: `Stress in ${ZN[i]} zone (${Math.round(h * 100)}% health)`, r: "Inspect on foot; check irrigation uniformity and apply foliar nutrients if leaves are yellowing." }); });
  if (w && w.soil != null && w.soil < 0.25 && w.rain3 < 5) a.push({ sev: "med", t: "Dry soil and little rain expected", r: "Irrigate 8–10 mm in the next 2 days." });
  if (!a.length) a.push({ sev: "ok", t: "No problems detected", r: "Keep the current schedule." }); a.push({ sev: "info", t: `Stage: ${stage}`, r: TIPS[stage] }); return a;
}
const arow = (a) => `<div class="sev-${a.sev}"><b>${a.t}</b><small>→ ${a.r}</small></div>`;
async function weather() {
  if (!S.cur) return;
  try { const j = await api(`https://api.open-meteo.com/v1/forecast?latitude=${S.cur.lat}&longitude=${S.cur.lon}&current=temperature_2m,relative_humidity_2m,precipitation&hourly=soil_moisture_1_to_3cm&daily=precipitation_sum,temperature_2m_max&forecast_days=7&timezone=auto`);
    S.weather = { t: j.current.temperature_2m, rh: j.current.relative_humidity_2m, p: j.current.precipitation, soil: j.hourly?.soil_moisture_1_to_3cm?.[new Date().getHours()] ?? null, daily: j.daily, rain3: j.daily.precipitation_sum.slice(0, 3).reduce((x, y) => x + y, 0) };
  } catch { S.weather = null; } redraw();
}

// ---- phenology ----
function renderPheno() {
  const st = sim.stageOf(S.dap), sc = SCEN[S.scen], avg = S.stats?.avg ?? 0.8;
  $("timeline").innerHTML = sim.STAGES.map(([n, d]) => `<div class="${n === st ? "on" : S.dap > d ? "past" : ""}">${n}<br><small>day ${d}+</small></div>`).join("");
  $("dapLbl").textContent = `Day ${S.dap} · ${new Date(new Date(S.plant).getTime() + S.dap * DAY).toDateString()} · ${st}`;
  const harvest = new Date(new Date(S.plant).getTime() + (sim.HARVEST_DAP + sc.d) * DAY);
  $("fc").innerHTML = [["Harvest date", harvest.toDateString()], ["Days to harvest (from today)", Math.max(0, sim.HARVEST_DAP + sc.d - S.today)], ["Est. yield", (58 * (0.6 + 0.4 * avg) * sc.y).toFixed(1) + " t/ha"],
    ["Avg fruit weight", (1.75 * (0.7 + 0.3 * avg) * sc.f).toFixed(2) + " kg"], ["Predicted Grade A", S.stats ? S.stats.fut.A.toFixed(0) + " %" : "–"]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("");
  const pts = (fn) => Array.from({ length: 53 }, (_, i) => `${i * 300 / 52},${100 - fn(i * 10) * 90}`).join(" ");
  $("curve").innerHTML = `<polyline fill="none" stroke="#3f9a4a" stroke-width="2.5" points="${pts((d) => sim.growth(d).plant)}"/><polyline fill="none" stroke="#ffc531" stroke-width="2.5" points="${pts((d) => sim.growth(d).fruit)}"/>
    <line x1="${S.dap * 300 / 520}" x2="${S.dap * 300 / 520}" y1="0" y2="105" stroke="#ff6b4a" stroke-dasharray="3"/><text x="4" y="10" font-size="9" fill="#3f9a4a">canopy</text><text x="50" y="10" font-size="9" fill="#d99a12">fruit</text>`;
}
let raf; const setDap = (d) => { S.dap = d; $("dap").value = d; renderPheno(); cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { setStage(S.dap); renderAll(); }); };
$("dap").oninput = (e) => setDap(+e.target.value); $("today").onclick = () => setDap(S.today);
$("plantDate").onchange = (e) => { S.plant = e.target.value; S.today = todayDap(); setDap(S.today); };
$("scen").onchange = (e) => { S.scen = e.target.value; renderPheno(); renderAll(); };
$("play").onclick = () => { if (S.play) { clearInterval(S.play); S.play = null; $("play").textContent = "▶ Play growth"; return; }
  if (S.dap >= 520) S.dap = 0; $("play").textContent = "⏸ Pause"; S.play = setInterval(() => { if (S.dap >= 520) { $("play").click(); return; } setDap(Math.min(520, S.dap + 3)); }, 70); };

// ---- render ----
const ring = (p) => { const c = 2 * Math.PI * 30, col = p > 75 ? "#3f9a4a" : p > 55 ? "#e6a912" : "#ff6b4a";
  return `<div class="ring"><svg viewBox="0 0 74 74"><circle cx="37" cy="37" r="30" fill="none" stroke="#ffffffaa" stroke-width="8"/><circle cx="37" cy="37" r="30" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c * p / 100} ${c}" transform="rotate(-90 37 37)"/></svg><b class="num">${p}%</b></div>`; };
let lastKey = "";
function renderAll() {
  const has = !!(S.cur && S.stats); $("dashEmpty").hidden = has; $("dashFull").hidden = !has; if (!has) { $("alertCount").textContent = 0; return; }
  const st = S.stats, al = alerts(), real = al.filter((a) => a.sev === "high" || a.sev === "med").length, sc = SCEN[S.scen], days = Math.max(0, sim.HARVEST_DAP + sc.d - S.today);
  $("dashTitle").textContent = S.cur.name; $("dashSub").textContent = `${S.cur.lat.toFixed(4)}, ${S.cur.lon.toFixed(4)} · ${S.cur.radius} m radius · Day ${S.dap} · ${sim.stageOf(S.dap)} · ${st.n.toLocaleString()} plants`;
  $("kHealth").innerHTML = ring(Math.round(st.avg * 100)); $("alertCount").textContent = real;
  const key = [S.cur.id, days, Math.round(st.fut.A), real].join("|"); if (key !== lastKey && !$("dashFull").hidden) { lastKey = key; countTo($("kDays"), days); countTo($("kGrade"), Math.round(st.fut.A), "%"); countTo($("kAlerts"), real); }
  $("alertList").innerHTML = $("probList").innerHTML = al.map(arow).join("");
  $("zones").innerHTML = st.zones.map((h, i) => `<div class="sev-${h < 0.5 ? "high" : h < 0.65 ? "med" : "ok"}"><b>${ZN[i]}</b><small>${Math.round(h * 100)}% health</small></div>`).join("");
  const w = S.weather, soil = w?.soil != null ? (w.soil * 100).toFixed(0) + " %" : "n/a";
  $("live").innerHTML = w ? [["Temperature", w.t + " °C"], ["Humidity", w.rh + " %"], ["Rain now", w.p + " mm"], ["Soil moisture (model)", soil], ["Canopy index (sim.)", (0.35 + 0.55 * st.avg).toFixed(2)]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("") : '<div class="mute">Weather unavailable</div>';
  $("weather").innerHTML = w ? w.daily.time.map((t, i) => `<div><small>${new Date(t).toDateString().slice(0, 10)}</small><br><b>${w.daily.temperature_2m_max[i]}°</b><br><small>${w.daily.precipitation_sum[i]} mm</small></div>`).join("") : '<span class="mute">Weather unavailable</span>';
  const bar = (l, v, c) => `<div>Class ${l}: <b>${v.toFixed(0)}%</b></div><div class="bar"><i style="width:${v}%;background:${c}"></i></div>`;
  $("quality").innerHTML = `<small>Now</small>${bar("A", st.cur.A, "#7cc242")}${bar("B", st.cur.B, "#ffc531")}${bar("C", st.cur.C, "#ff6b4a")}<small>Forecast at harvest</small>${bar("A", st.fut.A, "#7cc242")}${bar("B", st.fut.B, "#ffc531")}${bar("C", st.fut.C, "#ff6b4a")}`;
}
function redraw() { renderPheno(); renderAll(); if (!S.stats) return; drawMap($("cvDash"), "health"); drawMap($("cvHealth"), layer()); }
$$("input[name=lay]").forEach((r) => (r.onchange = () => drawMap($("cvHealth"), layer())));

// ---- viewer controls, inspector, export ----
$$(".vbtn[data-view]").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$("tPlants").onchange = (e) => setVisible("plants", e.target.checked); $("tFruit").onchange = (e) => setVisible("fruit", e.target.checked);
$("tObjects").onchange = (e) => setVisible("objects", e.target.checked); $("tStress").onchange = (e) => setStress(e.target.checked); $("detail").onchange = (e) => setDetail(+e.target.value);
$("snap").onclick = () => { const a = document.createElement("a"); a.href = snapshot(); a.download = `${S.cur?.name || "twin"}.png`; a.click(); };
setPickHandler((p) => { const f = sim.forecast(p.h), z = (p.x > 0 ? 1 : 0) + (p.y < 0 ? 2 : 0), stage = sim.stageOf(S.dap);
  $("inspect").innerHTML = `<div class="sev-${p.h < 0.55 ? "high" : p.h < 0.75 ? "med" : "ok"}"><b>Plant #${p.i}</b><small>${ZN[z]} zone · ${p.x.toFixed(0)} m E, ${p.y.toFixed(0)} m N</small></div>
    <div><small>Health now</small><b>${Math.round(p.h * 100)}% · Class ${sim.classOf(p.h)}</b></div><div><small>Forecast at harvest</small><b>${Math.round(f * 100)}% · Class ${sim.classOf(f)}</b></div>
    <div><small>Suggested action (${stage})</small>${p.h < 0.55 ? "Inspect this plant: check roots, moisture and nutrition." : TIPS[stage]}</div>`; });
$("csv").onclick = () => { const st = S.stats, r = [["metric", "value"], ["field", S.cur.name], ["stage", sim.stageOf(S.dap)], ["avg_health_pct", (st.avg * 100).toFixed(1)], ...ZN.map((n, i) => [n + "_health_pct", (st.zones[i] * 100).toFixed(1)]),
  ...["A", "B", "C"].flatMap((k) => [[`class_${k}_now_pct`, st.cur[k].toFixed(1)], [`class_${k}_harvest_pct`, st.fut[k].toFixed(1)]]), ["note", "health values are simulated"]];
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([r.map((x) => x.join(",")).join("\n")], { type: "text/csv" })); a.download = "pinetwin_report.csv"; a.click(); };

// ---- start ----
route(); window.__ptBooted = true;
(async () => { await loadFields(); const id = localStorage.getItem("pt_cur"); if (id && S.fields.some((f) => f.id === id)) await openField(id); else if (S.fields[0]) await openField(S.fields[0].id); route(); })();