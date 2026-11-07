import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"

UPLOADS_DIR = STORAGE_DIR / "uploads"
TEMP_PROCESSING_DIR = STORAGE_DIR / "temp_processing"
MODELS_3D_DIR = STORAGE_DIR / "models_3d"
DATABASE_DIR = STORAGE_DIR / "database"

for p in [UPLOADS_DIR, TEMP_PROCESSING_DIR, MODELS_3D_DIR, DATABASE_DIR]:
    os.makedirs(p, exist_ok=True)

HOST_IP = "0.0.0.0"
PORT = 8000