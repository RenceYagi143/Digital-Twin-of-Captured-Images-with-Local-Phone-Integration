import json, re, shutil, threading, time, uuid
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from backend.terrain_engine import build_twin
from backend import field_services as fs

ROOT = Path(__file__).resolve().parent.parent
FIELDS = ROOT / "storage" / "fields"; FIELDS.mkdir(parents=True, exist_ok=True)
JOBS: dict = {}
app = FastAPI(title="PineTwin")


class Req(BaseModel):
    lat: float
    lon: float
    radius: float = 400
    name: str = ""


def run_job(jid: str, r: Req):
    job = JOBS[jid]
    try:
        d = FIELDS / jid; d.mkdir(exist_ok=True)
        stats = build_twin(r.lat, r.lon, r.radius, str(d / "twin.glb"), plants_path=str(d / "plants.json"),
                           progress=lambda p, m: job.update(progress=p, message=m))
        meta = {"id": jid, "name": r.name.strip() or time.strftime("Field %d %b %H:%M"), "lat": r.lat, "lon": r.lon,
                "radius": r.radius, "created": time.time(), **stats}
        (d / "meta.json").write_text(json.dumps(meta))
        job.update(status="done", progress=1, message="Done", field=meta)
    except Exception as ex:
        job.update(status="error", message=f"{type(ex).__name__}: {ex}")


@app.post("/api/twin")
def start(r: Req):
    jid = uuid.uuid4().hex[:8]
    JOBS[jid] = {"status": "running", "progress": 0.0, "message": "Starting"}
    threading.Thread(target=run_job, args=(jid, r), daemon=True).start()
    return {"job": jid}


@app.get("/api/twin/{jid}")
def status(jid: str):
    if jid not in JOBS: raise HTTPException(404, "Unknown job")
    return JOBS[jid]


@app.get("/api/fields")
def fields():
    out = []
    for f in FIELDS.glob("*/meta.json"):
        try: out.append(json.loads(f.read_text()))
        except Exception: pass
    return sorted(out, key=lambda m: m.get("created", 0), reverse=True)


@app.delete("/api/fields/{fid}")
def delete(fid: str):
    if not re.fullmatch(r"[a-f0-9]{8}", fid): raise HTTPException(400, "Bad id")
    shutil.rmtree(FIELDS / fid, ignore_errors=True)
    return {"ok": True}


def _bad(ex): return HTTPException(502, f"{type(ex).__name__}: {ex}")


@app.get("/api/weather")
def weather(lat: float, lon: float, plant: str, horizon: int = 720):
    try: return {"days": fs.weather_series(lat, lon, plant, min(max(horizon, 60), 900))}
    except Exception as ex: raise _bad(ex)


@app.get("/api/market/places")
def places(lat: float, lon: float):
    try: return {"places": fs.nearby_places(lat, lon)}
    except Exception as ex: raise _bad(ex)


@app.get("/api/ndvi/{fid}")
def ndvi(fid: str):
    if not re.fullmatch(r"[a-f0-9]{8}", fid): raise HTTPException(400, "Bad id")
    d = FIELDS / fid; mp = d / "meta.json"
    if not mp.exists(): raise HTTPException(404, "Unknown field")
    cp = d / "ndvi.json"
    if cp.exists() and time.time() - cp.stat().st_mtime < 86400: return json.loads(cp.read_text())
    m = json.loads(mp.read_text())
    try: out = fs.ndvi(m["lat"], m["lon"], m["radius"])
    except Exception as ex: raise _bad(ex)
    if out.get("grid"): cp.write_text(json.dumps(out))
    return out


app.mount("/storage", StaticFiles(directory=ROOT / "storage"), name="storage")
app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="frontend")