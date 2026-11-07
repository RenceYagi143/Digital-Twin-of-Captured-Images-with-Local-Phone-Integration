"""Builds a textured 3D twin (terrain + buildings + trees) of a lat/lon area -> GLB."""
import io, json, math, random
from concurrent.futures import ThreadPoolExecutor
import numpy as np, requests, trimesh
from PIL import Image
from scipy.interpolate import RegularGridInterpolator
from shapely.geometry import Polygon, Point

UA = {"User-Agent": "3D-Digital-Twinning-Practice/1.0"}
TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
M_LAT = 111320.0


def _tile(lat, lon, z):
    n = 2 ** z
    return ((lon + 180) / 360 * n,
            (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


def _mosaic(s, w, n, e, z, url, mode):
    fx0, fy0 = _tile(n, w, z)
    fx1, fy1 = _tile(s, e, z)
    x0, y0, x1, y1 = int(fx0), int(fy0), int(fx1), int(fy1)
    sess = requests.Session(); sess.headers.update(UA)

    def get(xy):
        x, y = xy
        r = sess.get(url.format(z=z, x=x, y=y), timeout=30); r.raise_for_status()
        return xy, Image.open(io.BytesIO(r.content)).convert(mode)

    coords = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    canvas = Image.new(mode, ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256))
    with ThreadPoolExecutor(8) as ex:
        for (x, y), im in ex.map(get, coords):
            canvas.paste(im, ((x - x0) * 256, (y - y0) * 256))
    box = (round((fx0 - x0) * 256), round((fy0 - y0) * 256),
           round((fx1 - x0) * 256), round((fy1 - y0) * 256))
    return canvas.crop(box)


def _dem(s, w, n, e, size):
    img = np.asarray(_mosaic(s, w, n, e, 14, TERRARIUM, "RGB"), dtype=np.float64)
    elev = img[..., 0] * 256 + img[..., 1] + img[..., 2] / 256 - 32768
    return np.asarray(Image.fromarray(elev.astype("float32")).resize((size, size), Image.BILINEAR))


def _overpass(query):
    last = None
    for url in OVERPASS:
        try:
            r = requests.post(url, data={"data": query}, headers=UA, timeout=90)
            r.raise_for_status(); return r.json()["elements"]
        except Exception as ex:
            last = ex
    print("Overpass failed:", last); return []


def _height(tags):
    try:
        if "height" in tags: return float(str(tags["height"]).split()[0])
        if "building:levels" in tags: return float(tags["building:levels"]) * 3.2 + 1
    except ValueError: pass
    return 6.0


def make_plants(tex, radius_m, height_at_xy, max_n=100000, dx=0.45, dy=0.55):
    """Place individual plants (spacing dx x dy m) on vegetated pixels, aligned to the bed direction."""
    img = np.asarray(tex, dtype=np.float32)
    H, W, _ = img.shape
    R, G, B = img[..., 0], img[..., 1], img[..., 2]
    veg = ((2 * G - R - B) > 0) & (G >= R)
    gray = img.mean(2)
    c, hw = W // 2, max(8, int(60 * W / (2 * radius_m)))
    gy, gx = np.gradient(gray[c - hw:c + hw, c - hw:c + hw])
    theta = 0.5 * math.atan2(2 * (gx * gy).sum(), (gx * gx - gy * gy).sum()) + math.pi / 2
    ux, uy = math.cos(theta), -math.sin(theta)          # bed direction in world (x east, y north)
    rf = min(radius_m, math.sqrt(max_n * dx * dy / math.pi))
    A, Bv = np.meshgrid(np.arange(-rf, rf, dx), np.arange(-rf, rf, dy))
    rng = np.random.default_rng(1)
    A = A + rng.uniform(-.06, .06, A.shape); Bv = Bv + rng.uniform(-.06, .06, Bv.shape)
    X, Y = A * ux - Bv * uy, A * uy + Bv * ux
    ok = (X ** 2 + Y ** 2 < rf ** 2) & ((np.arange(Bv.shape[0])[:, None] % 8) < 6)  # 2-row walking aisle every 8 rows
    X, Y = X[ok], Y[ok]
    col = np.clip(((X + radius_m) / (2 * radius_m) * W).astype(int), 0, W - 1)
    row = np.clip(((radius_m - Y) / (2 * radius_m) * H).astype(int), 0, H - 1)
    keep = veg[row, col]
    X, Y = X[keep][:max_n], Y[keep][:max_n]
    Z = height_at_xy(X, Y)
    return X, Y, Z


def build_twin(lat, lon, radius_m, out_path, grid=220, plants_path=None, progress=None):
    radius_m = min(max(radius_m, 100), 1500)
    P = lambda p, m: progress(p, m) if progress else None
    P(0.05, 'Downloading elevation tiles')
    dlat = radius_m / M_LAT
    kx = M_LAT * math.cos(math.radians(lat))
    dlon = radius_m / kx
    s, n, w, e = lat - dlat, lat + dlat, lon - dlon, lon + dlon
    loc = lambda la, lo: ((lo - lon) * kx, (la - lat) * M_LAT)  # local metres (x east, y north)

    # ---- terrain ----
    dem = _dem(s, w, n, e, grid)                       # row 0 = north
    xs = np.linspace(-radius_m, radius_m, grid)
    ys = np.linspace(radius_m, -radius_m, grid)
    X, Y = np.meshgrid(xs, ys)
    verts = np.column_stack([X.ravel(), Y.ravel(), dem.ravel()])
    uv = np.column_stack([((X.ravel() + radius_m) / (2 * radius_m)),
                          ((Y.ravel() + radius_m) / (2 * radius_m))])
    idx = np.arange(grid * grid).reshape(grid, grid)
    a, b, c, d = idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, :-1].ravel(), idx[1:, 1:].ravel()
    faces = np.concatenate([np.column_stack([a, c, b]), np.column_stack([b, c, d])])
    P(0.30, 'Downloading satellite imagery')
    tex = _mosaic(s, w, n, e, 17 if radius_m <= 500 else 16, ESRI, "RGB")
    terrain = trimesh.Trimesh(verts, faces, process=False,
                              visual=trimesh.visual.TextureVisuals(uv=uv, image=tex))
    height_at = RegularGridInterpolator((ys[::-1], xs), dem[::-1], bounds_error=False, fill_value=None)
    ground = lambda x, y: float(height_at([[y, x]])[0])

    meshes = {"terrain": terrain}
    P(0.55, 'Reading buildings and trees from OpenStreetMap')
    bbox = f"({s},{w},{n},{e})"
    els = _overpass(f'[out:json][timeout:60];(way["building"]{bbox};way["natural"="wood"]{bbox};'
                    f'way["landuse"="forest"]{bbox};node["natural"="tree"]{bbox};);out geom;')

    P(0.72, 'Building 3D objects')
    # ---- buildings ----
    b_meshes, tree_pts, areas = [], [], []
    for el in els:
        tags = el.get("tags", {})
        if el["type"] == "node":
            tree_pts.append(loc(el["lat"], el["lon"])); continue
        pts = [loc(p["lat"], p["lon"]) for p in el.get("geometry", [])]
        if len(pts) < 4: continue
        poly = Polygon(pts)
        if not poly.is_valid: poly = poly.buffer(0)
        if poly.is_empty or poly.geom_type != "Polygon": continue
        if "building" in tags:
            h = _height(tags)
            zs = [ground(x, y) for x, y in poly.exterior.coords]
            m = trimesh.creation.extrude_polygon(poly, h + (max(zs) - min(zs)))
            m.apply_translation([0, 0, min(zs) - 0.2])
            m.visual.face_colors = [205, 195, 180, 255]
            b_meshes.append(m)
        else:
            areas.append(poly)
    if b_meshes: meshes["buildings"] = trimesh.util.concatenate(b_meshes)

    # ---- trees (mapped trees + scattered inside forest polygons) ----
    random.seed(1)
    for poly in areas:
        minx, miny, maxx, maxy = poly.bounds
        for _ in range(min(int(poly.area / 60), 800)):
            p = Point(random.uniform(minx, maxx), random.uniform(miny, maxy))
            if poly.contains(p): tree_pts.append((p.x, p.y))
    tree_pts = [p for p in tree_pts if abs(p[0]) < radius_m and abs(p[1]) < radius_m][:3000]
    t_meshes = []
    for x, y in tree_pts:
        h = random.uniform(6, 14); z = ground(x, y)
        trunk = trimesh.creation.cylinder(radius=0.25, height=h * 0.4, sections=6)
        trunk.apply_translation([x, y, z + h * 0.2]); trunk.visual.face_colors = [90, 60, 35, 255]
        crown = trimesh.creation.icosphere(subdivisions=1, radius=h * 0.3)
        crown.apply_translation([x, y, z + h * 0.65]); crown.visual.face_colors = [40, 110, 45, 255]
        t_meshes += [trunk, crown]
    if t_meshes: meshes["trees"] = trimesh.util.concatenate(t_meshes)

    P(0.85, 'Planting the crop')
    # ---- plantation (individual plants, rendered as instances in the viewer) ----
    n_plants, cz = 0, ground(0, 0)
    if plants_path:
        X, Y, Z = make_plants(tex, radius_m, lambda x, y: height_at(np.column_stack([y, x])))
        json.dump({"x": np.round(X, 2).tolist(), "y": np.round(Y, 2).tolist(),
                   "z": np.round(Z, 2).tolist(), "center_z": cz}, open(plants_path, "w"))
        n_plants = len(X)

    P(0.93, 'Exporting 3D model')
    # ---- export (Z-up -> glTF Y-up) ----
    rot = trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0])
    scene = trimesh.Scene()
    for name, m in meshes.items():
        scene.add_geometry(m, node_name=name, geom_name=name, transform=rot)
    scene.export(out_path)
    return {"plants": n_plants, "buildings": len(b_meshes), "trees": len(tree_pts),
            "min_elev": float(dem.min()), "max_elev": float(dem.max()), "size_m": radius_m * 2}