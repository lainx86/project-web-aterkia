import os
import json
import shutil
import logging
import threading
from datetime import datetime, timedelta
from typing import Literal, Optional

import jwt
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, status
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator

# ============================================================
# LOGGING SETUP
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("asv_backend.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("asv-backend")

# ============================================================
# APP & CONFIG
# ============================================================
app = FastAPI(
    title="ASV Backend",
    description="Backend monitoring Autonomous Surface Vehicle dengan autentikasi JWT.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Ganti dengan domain spesifik di production
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
ASSETS_DIR  = os.path.join(BASE_DIR, "assets")
ADMIN_STATE_FILE = os.path.join(UPLOADS_DIR, "admin_state.json")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(ASSETS_DIR,  exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/assets",  StaticFiles(directory=ASSETS_DIR),  name="assets")

# ============================================================
# JWT CONFIG  (ganti SECRET_KEY dengan nilai acak yang kuat!)
# ============================================================
SECRET_KEY      = os.environ.get("ASV_SECRET_KEY", "ganti-dengan-secret-acak-yang-panjang-dan-kuat")
ALGORITHM       = "HS256"
TOKEN_EXPIRE_HOURS = 8

# Kredensial admin  (idealnya simpan di env var / database)
ADMIN_USERNAME = os.environ.get("ASV_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("ASV_ADMIN_PASS", "asv2025")

security = HTTPBearer()

# ============================================================
# KONSTANTA VALIDASI
# ============================================================
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_CSV_TYPES   = {"text/csv", "application/csv", "text/plain"}
MAX_IMAGE_SIZE_MB   = 10
MAX_CSV_SIZE_MB     = 5
MAX_FILENAME_LEN    = 100

# ============================================================
# PYDANTIC MODELS
# ============================================================

class CVCounts(BaseModel):
    red:   int = Field(0, ge=0, description="Jumlah deteksi red buoy")
    green: int = Field(0, ge=0, description="Jumlah deteksi green buoy")
    track: int = Field(0, ge=0, description="Jumlah deteksi track")


class AdminState(BaseModel):
    theme:        Literal["light", "dark"] = "dark"
    defaultTrack: str = Field("A", min_length=1, max_length=10)
    cv_counts:    CVCounts = Field(default_factory=CVCounts)

    @field_validator("defaultTrack")
    @classmethod
    def track_alphanumeric(cls, v: str) -> str:
        if not v.isalnum():
            raise ValueError("defaultTrack hanya boleh berisi huruf dan angka")
        return v.upper()


class AdminStateUpdate(BaseModel):
    """Semua field opsional — hanya field yang dikirim yang akan diupdate."""
    theme:        Optional[Literal["light", "dark"]] = None
    defaultTrack: Optional[str]                      = Field(None, min_length=1, max_length=10)
    cv_counts:    Optional[CVCounts]                 = None

    @field_validator("defaultTrack")
    @classmethod
    def track_alphanumeric(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.isalnum():
            raise ValueError("defaultTrack hanya boleh berisi huruf dan angka")
        return v.upper() if v else v


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=100)


class LoginResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    expires_in:   int  # detik


# ============================================================
# STATE MANAGEMENT (thread-safe dengan Lock)
# ============================================================
_state_lock  = threading.Lock()
_admin_state = AdminState()   # default


def load_state() -> None:
    global _admin_state
    if not os.path.exists(ADMIN_STATE_FILE):
        logger.info("State file belum ada, menggunakan default.")
        return
    try:
        with open(ADMIN_STATE_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        _admin_state = AdminState(**raw)
        logger.info("Admin state berhasil dimuat dari file.")
    except Exception as exc:
        logger.error("Gagal memuat state file: %s — menggunakan default.", exc)


def save_state() -> None:
    with _state_lock:
        try:
            with open(ADMIN_STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(_admin_state.model_dump(), f, indent=2, ensure_ascii=False)
            logger.info("Admin state disimpan.")
        except Exception as exc:
            logger.error("Gagal menyimpan state: %s", exc)


@app.on_event("startup")
def startup() -> None:
    load_state()
    logger.info("ASV Backend v2.0 siap.")


# ============================================================
# JWT HELPERS
# ============================================================

def create_access_token(username: str) -> str:
    expire  = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {"sub": username, "exp": expire, "iat": datetime.utcnow()}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Dependency — memastikan request membawa token JWT yang valid."""
    token = credentials.credentials
    try:
        payload  = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise ValueError("Token tidak mengandung subject.")
        return username
    except jwt.ExpiredSignatureError:
        logger.warning("Percobaan akses dengan token kadaluarsa.")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token sudah kadaluarsa.")
    except jwt.InvalidTokenError as exc:
        logger.warning("Token tidak valid: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid.")


# ============================================================
# UPLOAD HELPERS
# ============================================================

def _safe_filename(filename: str) -> str:
    """Hapus karakter berbahaya untuk mencegah path traversal."""
    basename = os.path.basename(filename)
    safe     = "".join(c for c in basename if c.isalnum() or c in (".", "-", "_"))
    if not safe:
        raise HTTPException(status_code=400, detail="Nama file tidak valid.")
    if len(safe) > MAX_FILENAME_LEN:
        raise HTTPException(status_code=400, detail=f"Nama file terlalu panjang (maks {MAX_FILENAME_LEN} karakter).")
    return safe


def _validate_and_save(
    file: UploadFile,
    target_dir: str,
    allowed_types: set[str],
    max_mb: float,
) -> str:
    """Validasi tipe & ukuran file, lalu simpan. Return nama file yang aman."""
    safe_name = _safe_filename(file.filename or "upload")

    # Validasi content-type
    ct = (file.content_type or "").lower()
    if ct not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Tipe file '{ct}' tidak diizinkan. Tipe yang diterima: {allowed_types}",
        )

    # Baca & validasi ukuran
    data = file.file.read()
    max_bytes = int(max_mb * 1024 * 1024)
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Ukuran file melebihi batas {max_mb} MB.",
        )

    dest = os.path.join(target_dir, safe_name)
    with open(dest, "wb") as buf:
        buf.write(data)

    logger.info("File disimpan: %s (%d bytes)", dest, len(data))
    return safe_name


# ============================================================
# ENDPOINTS — PUBLIC
# ============================================================

@app.get("/", tags=["Info"])
def root():
    return {"message": "ASV Backend v2.0 siap.", "docs": "/docs"}


@app.post("/api/auth/login", response_model=LoginResponse, tags=["Auth"])
def login(body: LoginRequest):
    """Login admin — mengembalikan JWT access token."""
    if body.username != ADMIN_USERNAME or body.password != ADMIN_PASSWORD:
        logger.warning("Gagal login untuk username: '%s'", body.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username atau password salah.",
        )
    token   = create_access_token(body.username)
    expires = TOKEN_EXPIRE_HOURS * 3600
    logger.info("Login berhasil: '%s'", body.username)
    return LoginResponse(access_token=token, expires_in=expires)


# State & gambar boleh dibaca tanpa token (untuk monitoring publik)
@app.get("/api/admin/state", response_model=AdminState, tags=["Admin"])
def get_admin_state():
    return _admin_state


@app.get("/api/images", tags=["Gallery"])
def get_images():
    try:
        files = [
            f for f in os.listdir(UPLOADS_DIR)
            if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
        ]
        files.sort(
            key=lambda x: os.path.getmtime(os.path.join(UPLOADS_DIR, x)),
            reverse=True,
        )
        return {"images": files}
    except Exception as exc:
        logger.error("Gagal list gambar: %s", exc)
        raise HTTPException(status_code=500, detail="Gagal membaca daftar gambar.")


# ============================================================
# ENDPOINTS — PROTECTED (butuh JWT)
# ============================================================

@app.post("/api/admin/update", response_model=AdminState, tags=["Admin"])
def update_admin_state(
    payload: AdminStateUpdate,
    _user: str = Depends(verify_token),
):
    """Update sebagian atau seluruh state admin. Membutuhkan token JWT."""
    global _admin_state
    with _state_lock:
        current = _admin_state.model_dump()
        updates  = payload.model_dump(exclude_none=True)
        # Merge cv_counts secara mendalam
        if "cv_counts" in updates and current.get("cv_counts"):
            current["cv_counts"].update(updates.pop("cv_counts"))
        current.update(updates)
        _admin_state = AdminState(**current)
    save_state()
    logger.info("State diupdate oleh '%s': %s", _user, updates)
    return _admin_state


@app.post("/api/upload/image", tags=["Upload"])
def upload_image(
    file: UploadFile = File(...),
    _user: str = Depends(verify_token),
):
    """Upload gambar ke folder uploads. Maks 10 MB. Format: jpg, png, webp."""
    safe_name = _validate_and_save(file, UPLOADS_DIR, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE_MB)
    return {"status": "success", "filename": safe_name}


@app.post("/api/upload/csv", tags=["Upload"])
def upload_csv(
    file: UploadFile = File(...),
    _user: str = Depends(verify_token),
):
    """Upload file CSV track ke folder uploads. Maks 5 MB."""
    safe_name = _validate_and_save(file, UPLOADS_DIR, ALLOWED_CSV_TYPES, MAX_CSV_SIZE_MB)
    return {"status": "success", "filename": safe_name}


@app.delete("/api/images/{filename}", tags=["Gallery"])
def delete_image(
    filename: str,
    _user: str = Depends(verify_token),
):
    safe_name = _safe_filename(filename)
    file_path = os.path.join(UPLOADS_DIR, safe_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File tidak ditemukan.")
    os.remove(file_path)
    logger.info("Gambar dihapus oleh '%s': %s", _user, safe_name)
    return {"status": "success", "message": f"{safe_name} berhasil dihapus."}


@app.delete("/api/images/all/clear", tags=["Gallery"])
def delete_all_images(_user: str = Depends(verify_token)):
    count = 0
    errors = []
    for f in os.listdir(UPLOADS_DIR):
        if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            try:
                os.remove(os.path.join(UPLOADS_DIR, f))
                count += 1
            except Exception as exc:
                errors.append(f)
                logger.error("Gagal hapus %s: %s", f, exc)
    logger.info("Clear gallery oleh '%s': %d file dihapus, %d gagal.", _user, count, len(errors))
    return {"status": "success", "deleted_count": count, "failed": errors}