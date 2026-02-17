import os
import json
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(title="ASV Backend - Admin HTTP (Full CRUD)")

# --- CONFIG ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
ADMIN_STATE_FILE = os.path.join(UPLOADS_DIR, "admin_state.json")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(ASSETS_DIR, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")

# --- STATE MANAGEMENT ---
admin_state = {
    "theme": "light",
    "defaultTrack": "A",
    "cv_counts": {"red": 0, "green": 0, "track": 0}
}

@app.on_event("startup")
def startup():
    global admin_state
    if os.path.exists(ADMIN_STATE_FILE):
        try:
            with open(ADMIN_STATE_FILE, "r") as f:
                admin_state = json.load(f)
            print("Admin state loaded.")
        except:
            print("Gagal load state, pakai default.")

def save_state():
    with open(ADMIN_STATE_FILE, "w") as f:
        json.dump(admin_state, f, indent=2)

# --- ENDPOINTS ---

@app.get("/")
def root():
    return {"message": "ASV Backend Ready (Full CRUD)"}

# [READ] Ambil State
@app.get("/api/admin/state")
def get_admin_state():
    return admin_state

# [UPDATE] Ubah State
@app.post("/api/admin/update")
def update_admin_state(payload: dict):
    for key, value in payload.items():
        if key in admin_state:
            admin_state[key] = value
    save_state()
    return {"status": "success", "new_state": admin_state}

# [CREATE] Upload File
@app.post("/api/upload")
def upload_file(file: UploadFile = File(...), type: str = "image"):
    try:
        target_dir = ASSETS_DIR if type == "csv" else UPLOADS_DIR
        file_path = os.path.join(target_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"status": "success", "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# [READ] List semua gambar untuk Galeri
@app.get("/api/images")
def get_images():
    # Ambil file yang berakhiran jpg/png/jpeg
    files = [f for f in os.listdir(UPLOADS_DIR) if f.endswith(('.png', '.jpg', '.jpeg'))]
    # Urutkan dari yang terbaru (opsional)
    files.sort(key=lambda x: os.path.getmtime(os.path.join(UPLOADS_DIR, x)), reverse=True)
    return {"images": files}

# [DELETE] Hapus satu gambar
@app.delete("/api/images/{filename}")
def delete_image(filename: str):
    file_path = os.path.join(UPLOADS_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return {"status": "success", "message": f"{filename} deleted"}
    raise HTTPException(status_code=404, detail="File not found")

# [DELETE] Hapus semua gambar (Tombol Clear)
@app.delete("/api/images/all/clear")
def delete_all_images():
    count = 0
    for f in os.listdir(UPLOADS_DIR):
        if f.endswith(('.png', '.jpg', '.jpeg')):
            os.remove(os.path.join(UPLOADS_DIR, f))
            count += 1
    return {"status": "success", "deleted_count": count}