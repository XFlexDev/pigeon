import hashlib
import json
import math
import os
import random
import secrets
import sqlite3
import time
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DATA = Path(os.environ.get("PIGEON_DATA", str(ROOT / "data")))
DATA.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA / "pigeon.db"

PIGEON_SPEED_KMH = 80.0
MIN_FLIGHT_KM = 25.0
MIN_FLIGHT_SEC = 15 * 60
EARTH_R_KM = 6371.0

PIGEON_NAMES = [
    "Kerttu", "Pip", "Wilma", "Sulo", "Aaro", "Nemo", "Kippari", "Lintu",
    "Hokus", "Vilho", "Ruska", "Tuulevi", "Paju", "Kaste", "Usva", "Valo",
    "Orbi", "Murre", "Sipi", "Lumo", "Aino", "Pilvi", "Riekko", "Kauno",
]


def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


with db() as con:
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE COLLATE NOCASE,
            pass_hash TEXT,
            token TEXT UNIQUE,
            lat REAL,
            lon REAL,
            created_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS letters(
            id INTEGER PRIMARY KEY,
            from_id INTEGER,
            to_id INTEGER,
            body TEXT,
            pigeon TEXT,
            sent_at INTEGER,
            dist_km REAL,
            dur_sec INTEGER,
            read_at INTEGER
        );
        """
    )


def hash_pass(pw: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 100_000).hex()
    return f"{salt}:{h}"


def check_pass(pw: str, stored: str) -> bool:
    salt, h = stored.split(":", 1)
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 100_000).hex() == h


def authed(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "unauthorized")
    token = authorization[7:]
    with db() as con:
        row = con.execute("SELECT * FROM users WHERE token=?", (token,)).fetchone()
    if not row:
        raise HTTPException(401, "unauthorized")
    return dict(row)


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_KM * math.asin(math.sqrt(a))


def slerp(lat1, lon1, lat2, lon2, t):
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    ax, ay, az = (
        math.cos(lat1) * math.cos(lon1),
        math.cos(lat1) * math.sin(lon1),
        math.sin(lat1),
    )
    bx, by, bz = (
        math.cos(lat2) * math.cos(lon2),
        math.cos(lat2) * math.sin(lon2),
        math.sin(lat2),
    )
    dot = max(-1.0, min(1.0, ax * bx + ay * by + az * bz))
    omega = math.acos(dot)
    if omega < 1e-6:
        return math.degrees(lat1), math.degrees(lon1)
    so = math.sin(omega)
    ka = math.sin((1 - t) * omega) / so
    kb = math.sin(t * omega) / so
    x, y, z = ka * ax + kb * bx, ka * ay + kb * by, ka * az + kb * bz
    return math.degrees(math.asin(z)), math.degrees(math.atan2(y, x))


def flight_state(letter, me):
    now = int(time.time())
    elapsed = now - letter["sent_at"]
    frac = min(1.0, elapsed / letter["dur_sec"]) if letter["dur_sec"] else 1.0
    arrived = frac >= 1.0
    lat, lon = slerp(letter["from_lat"], letter["from_lon"], letter["to_lat"], letter["to_lon"], frac)
    return {
        "id": letter["id"],
        "pigeon": letter["pigeon"],
        "direction": "out" if letter["from_id"] == me["id"] else "in",
        "peer": letter["to_name"] if letter["from_id"] == me["id"] else letter["from_name"],
        "sent_at": letter["sent_at"],
        "dist_km": round(letter["dist_km"], 1),
        "dur_sec": letter["dur_sec"],
        "progress": frac,
        "arrived": arrived,
        "pos": {"lat": lat, "lon": lon},
        "from": {"lat": letter["from_lat"], "lon": letter["from_lon"], "name": letter["from_name"]},
        "to": {"lat": letter["to_lat"], "lon": letter["to_lon"], "name": letter["to_name"]},
        "eta_at": letter["sent_at"] + letter["dur_sec"],
        "read_at": letter["read_at"],
        "body": letter["body"] if arrived or letter["from_id"] == me["id"] else None,
    }


LETTER_SQL = """
SELECT l.*, uf.username AS from_name, ut.username AS to_name,
       uf.lat AS from_lat, uf.lon AS from_lon, ut.lat AS to_lat, ut.lon AS to_lon
FROM letters l JOIN users uf ON uf.id=l.from_id JOIN users ut ON ut.id=l.to_id
"""


class AuthIn(BaseModel):
    username: str
    password: str
    lat: float | None = None
    lon: float | None = None


class LetterIn(BaseModel):
    to: str
    body: str


app = FastAPI()


@app.post("/api/auth/register")
def register(inp: AuthIn):
    username = inp.username.strip()
    if not (3 <= len(username) <= 24) or not username.replace("_", "").replace("-", "").isalnum():
        raise HTTPException(400, "username must be 3-24 letters/numbers")
    if len(inp.password) < 4:
        raise HTTPException(400, "password too short")
    if inp.lat is None or inp.lon is None:
        raise HTTPException(400, "place your coop")
    lat = max(-85.0, min(85.0, inp.lat))
    lon = ((inp.lon + 180) % 360) - 180
    token = secrets.token_urlsafe(32)
    try:
        with db() as con:
            con.execute(
                "INSERT INTO users(username,pass_hash,token,lat,lon,created_at) VALUES(?,?,?,?,?,?)",
                (username, hash_pass(inp.password), token, lat, lon, int(time.time())),
            )
    except sqlite3.IntegrityError:
        raise HTTPException(409, "username taken")
    return {"token": token, "username": username, "lat": lat, "lon": lon}


@app.post("/api/auth/login")
def login(inp: AuthIn):
    with db() as con:
        row = con.execute("SELECT * FROM users WHERE username=?", (inp.username.strip(),)).fetchone()
    if not row or not check_pass(inp.password, row["pass_hash"]):
        raise HTTPException(401, "bad credentials")
    return {
        "token": row["token"],
        "username": row["username"],
        "lat": row["lat"],
        "lon": row["lon"],
    }


@app.get("/api/me")
def me(authorization: str | None = Header(None)):
    u = authed(authorization)
    return {"username": u["username"], "lat": u["lat"], "lon": u["lon"], "id": u["id"]}


@app.get("/api/users/{username}")
def user_info(username: str, authorization: str | None = Header(None)):
    me = authed(authorization)
    with db() as con:
        row = con.execute(
            "SELECT id,username,lat,lon FROM users WHERE username=?", (username.strip(),)
        ).fetchone()
    if not row:
        raise HTTPException(404, "no such coop")
    dist = haversine(me["lat"], me["lon"], row["lat"], row["lon"])
    eff = max(dist, MIN_FLIGHT_KM)
    dur = max(int(eff / PIGEON_SPEED_KMH * 3600), MIN_FLIGHT_SEC)
    return {"username": row["username"], "dist_km": round(dist, 1), "dur_sec": dur}


@app.post("/api/letters")
def send_letter(inp: LetterIn, authorization: str | None = Header(None)):
    me = authed(authorization)
    body = inp.body.strip()
    if not body:
        raise HTTPException(400, "empty letter")
    if len(body) > 4000:
        raise HTTPException(400, "letter too long")
    with db() as con:
        to = con.execute("SELECT * FROM users WHERE username=?", (inp.to.strip(),)).fetchone()
        if not to:
            raise HTTPException(404, "no such coop")
        dist = haversine(me["lat"], me["lon"], to["lat"], to["lon"])
        dur = max(int(max(dist, MIN_FLIGHT_KM) / PIGEON_SPEED_KMH * 3600), MIN_FLIGHT_SEC)
        cur = con.execute(
            "INSERT INTO letters(from_id,to_id,body,pigeon,sent_at,dist_km,dur_sec) VALUES(?,?,?,?,?,?,?)",
            (me["id"], to["id"], body, random.choice(PIGEON_NAMES), int(time.time()), dist, dur),
        )
        letter = con.execute(LETTER_SQL + " WHERE l.id=?", (cur.lastrowid,)).fetchone()
    return flight_state(dict(letter), me)


@app.get("/api/mail")
def mail(authorization: str | None = Header(None)):
    me = authed(authorization)
    with db() as con:
        rows = con.execute(
            LETTER_SQL + " WHERE l.from_id=? OR l.to_id=? ORDER BY l.sent_at DESC",
            (me["id"], me["id"]),
        ).fetchall()
    flying_out, flying_in, delivered = [], [], []
    for r in rows:
        st = flight_state(dict(r), me)
        if not st["arrived"]:
            (flying_out if st["direction"] == "out" else flying_in).append(st)
        else:
            delivered.append(st)
    return {"flying_out": flying_out, "flying_in": flying_in, "delivered": delivered}


@app.post("/api/letters/{letter_id}/read")
def mark_read(letter_id: int, authorization: str | None = Header(None)):
    me = authed(authorization)
    with db() as con:
        row = con.execute(LETTER_SQL + " WHERE l.id=?", (letter_id,)).fetchone()
        if not row or (row["from_id"] != me["id"] and row["to_id"] != me["id"]):
            raise HTTPException(404, "not found")
        if row["to_id"] == me["id"] and row["read_at"] is None:
            con.execute("UPDATE letters SET read_at=? WHERE id=?", (int(time.time()), letter_id))
    return {"ok": True}


@app.get("/")
def index():
    return FileResponse(WEB / "index.html")


@app.get("/{path:path}")
def static_files(path: str):
    target = (WEB / path).resolve() if path else WEB / "index.html"
    if not str(target).startswith(str(WEB.resolve())) or not target.is_file():
        target = WEB / "index.html"
    return FileResponse(target)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PIGEON_PORT", "8377")))
