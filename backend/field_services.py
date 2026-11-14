"""Real-data services: weather series (growth model input), nearby selling points (OSM), Sentinel-2 NDVI."""
import datetime as dt, math, time
import numpy as np, requests

UA = {"User-Agent": "PineTwin/1.0"}
_cache: dict = {}
OM_ARCHIVE, OM_FORECAST = "https://archive-api.open-meteo.com/v1/archive", "https://api.open-meteo.com/v1/forecast"
DAILY = "temperature_2m_mean,precipitation_sum"


def _get(url, params, ttl=6 * 3600):
    key = (url, tuple(sorted(params.items())))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl: return hit[1]
    r = requests.get(url, params=params, headers=UA, timeout=45); r.raise_for_status()
    j = r.json(); _cache[key] = (time.time(), j); return j


def weather_series(lat, lon, start_iso, horizon=720):
    """Daily mean temp + rain from planting: observed (ERA5) -> recent/forecast -> climatology (3-year average)."""
    today = dt.date.today(); start = dt.date.fromisoformat(start_iso); end = start + dt.timedelta(days=horizon)
    p = dict(latitude=round(lat, 3), longitude=round(lon, 3), daily=DAILY, timezone="auto")
    days = {}
    arch_end = min(today - dt.timedelta(days=8), end)
    if start <= arch_end:
        j = _get(OM_ARCHIVE, {**p, "start_date": start.isoformat(), "end_date": arch_end.isoformat()})
        for d, t, r in zip(j["daily"]["time"], j["daily"]["temperature_2m_mean"], j["daily"]["precipitation_sum"]):
            if t is not None: days[d] = (t, r or 0.0, "obs")
    j = _get(OM_FORECAST, {**p, "past_days": 14, "forecast_days": 16})
    for d, t, r in zip(j["daily"]["time"], j["daily"]["temperature_2m_mean"], j["daily"]["precipitation_sum"]):
        dd = dt.date.fromisoformat(d)
        if t is not None and start <= dd <= end and d not in days: days[d] = (t, r or 0.0, "obs" if dd <= today else "forecast")
    cs, ce = today - dt.timedelta(days=3 * 365 + 8), today - dt.timedelta(days=8)
    j = _get(OM_ARCHIVE, {**p, "start_date": cs.isoformat(), "end_date": ce.isoformat()}, ttl=24 * 3600)
    clim: dict = {}
    for d, t, r in zip(j["daily"]["time"], j["daily"]["temperature_2m_mean"], j["daily"]["precipitation_sum"]):
        if t is not None: clim.setdefault(d[5:], []).append((t, r or 0.0))
    out, d = [], start
    while d <= end:
        k = d.isoformat()
        if k in days: t, r, s = days[k]
        else:
            v = clim.get(k[5:]) or clim.get("02-28") or [(26.0, 5.0)]
            t, r, s = float(np.mean([a for a, _ in v])), float(np.mean([b for _, b in v])), "climate"
        out.append({"date": k, "t": round(t, 2), "rain": round(r, 1), "src": s}); d += dt.timedelta(days=1)
    return out


def _hav(la1, lo1, la2, lo2):
    p = math.pi / 180; a = 0.5 - math.cos((la2 - la1) * p) / 2 + math.cos(la1 * p) * math.cos(la2 * p) * (1 - math.cos((lo2 - lo1) * p)) / 2
    return 12742 * math.asin(math.sqrt(a))


def nearby_places(lat, lon, km=60):
    """Markets, wholesalers and fruit processors/packers from OpenStreetMap near the field."""
    r = km * 1000; a = f"(around:{r},{lat},{lon})"
    q = f'[out:json][timeout:40];(nwr["amenity"="marketplace"]{a};nwr["shop"="wholesale"]{a};nwr["name"~"Del Monte|Dole|cannery|fruit|packing|pineapple",i]["amenity"!~"restaurant|cafe|fast_food"]{a};);out center 120;'
    els = []
    for url in ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]:
        try:
            x = requests.post(url, data={"data": q}, headers=UA, timeout=60); x.raise_for_status(); els = x.json()["elements"]; break
        except Exception: continue
    res, seen = [], set()
    for e in els:
        t = e.get("tags", {}); name = t.get("name")
        la, lo = (e.get("lat"), e.get("lon")) if e["type"] == "node" else (e.get("center", {}).get("lat"), e.get("center", {}).get("lon"))
        if not name or la is None or name in seen: continue
        seen.add(name)
        kind = "Public market" if t.get("amenity") == "marketplace" else "Wholesaler" if t.get("shop") == "wholesale" else "Processor / packer"
        res.append({"name": name, "kind": kind, "lat": la, "lon": lo, "km": round(_hav(lat, lon, la, lo), 1)})
    return sorted(res, key=lambda x: x["km"])[:15]


def ndvi(lat, lon, radius_m, n=40, max_scenes=4):
    """Real crop vigour from Sentinel-2 L2A (10 m): NDVI grid of the latest clear scene + recent scene means."""
    from pystac_client import Client
    import rasterio
    from rasterio.windows import from_bounds
    from rasterio.enums import Resampling
    from pyproj import Transformer
    dlat = radius_m / 111320; dlon = radius_m / (111320 * math.cos(math.radians(lat)))
    bbox = [lon - dlon, lat - dlat, lon + dlon, lat + dlat]
    end = dt.date.today(); start = end - dt.timedelta(days=90)
    items = list(Client.open("https://earth-search.aws.element84.com/v1").search(
        collections=["sentinel-2-l2a"], bbox=bbox, datetime=f"{start}/{end}", query={"eo:cloud_cover": {"lt": 50}}, max_items=40).items())
    items.sort(key=lambda i: i.datetime, reverse=True)
    scenes, grid, gdate = [], None, None
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES"):
        for it in items:
            if len(scenes) >= max_scenes: break
            try:
                tr = Transformer.from_crs(4326, int(it.properties["proj:epsg"]), always_xy=True)
                x0, y0 = tr.transform(bbox[0], bbox[1]); x1, y1 = tr.transform(bbox[2], bbox[3])
                bounds = (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))

                def rd(key, rs):
                    with rasterio.open(it.assets[key].href) as src:
                        return src.read(1, window=from_bounds(*bounds, transform=src.transform), out_shape=(n, n), resampling=rs, boundless=True, fill_value=0).astype("float32")
                red, nir, scl = rd("red", Resampling.bilinear), rd("nir", Resampling.bilinear), rd("scl", Resampling.nearest)
                valid = (red > 0) & (nir > 0) & ~np.isin(scl, [0, 1, 3, 8, 9, 10, 11])
                if valid.mean() < 0.5: continue
                r_, n_ = red * 1e-4 - 0.1, nir * 1e-4 - 0.1          # processing baseline >= 04.00 offset
                v = (n_ - r_) / (n_ + r_ + 1e-6); v[~valid] = np.nan
                scenes.append({"date": it.datetime.date().isoformat(), "cloud": it.properties.get("eo:cloud_cover"), "mean": round(float(np.nanmean(v)), 3)})
                if grid is None:
                    grid = [[None if np.isnan(c) else round(float(c), 2) for c in row] for row in v]; gdate = scenes[-1]["date"]
            except Exception:
                continue
    return {"scenes": scenes, "grid": grid, "date": gdate, "n": n, "radius": radius_m, "error": None if grid else "No clear Sentinel-2 scene in the last 90 days"}