import json, re, shutil, threading, time, uuid
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from backend.terrain_engine import build_twin

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


app.mount("/storage", StaticFiles(directory=ROOT / "storage"), name="storage")
app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="frontend")