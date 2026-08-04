"""
Douglas County House-Hunt & School-Comparison Tracker
Small local Flask app: serves the static frontend and persists the whole
app state (houses, schools, tasks, weights) as a single JSON blob on disk
so two people on the same home network can share live data.
"""
import hmac
import json
import os
import re
import shutil
import tempfile
from datetime import date, datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

import requests
from flask import Flask, Response, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data.json"
STATIC_DIR = BASE_DIR / "static"
BACKUPS_DIR = BASE_DIR / "backups"
UPLOADS_DIR = BASE_DIR / "uploads"
MAX_BACKUPS = 30
SCORE_HISTORY_DAYS = 180
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
PHOTO_EXTS = {"png", "jpg", "jpeg", "gif", "webp"}
DOC_EXTS = {"pdf", "doc", "docx", "txt", "xlsx", "xls"}
ALLOWED_UPLOAD_EXTS = PHOTO_EXTS | DOC_EXTS

AUTH_USERNAME = os.environ.get("AUTH_USERNAME", "abcdef")
AUTH_PASSWORD = os.environ.get("AUTH_PASSWORD", "QOU8IGg89LDB4NACKcve")
GEOCODE_API_KEY = (os.environ.get("GEOCODE_API_KEY") or "").strip() or None
IMPORT_LISTING_MAX_BYTES = 1_000_000

app = Flask(__name__, static_folder=None)


@app.before_request
def require_auth():
    auth = request.authorization
    valid = (
        auth is not None
        and hmac.compare_digest(auth.username, AUTH_USERNAME)
        and hmac.compare_digest(auth.password, AUTH_PASSWORD)
    )
    if not valid:
        return Response(
            "Authentication required.", 401,
            {"WWW-Authenticate": 'Basic realm="House Hunt Tracker"'},
        )


def seed_state():
    """Fictional example data so the app is immediately usable. Houses/prices
    are made up; school names are real, publicly-known DCSD schools used only
    as illustrative examples."""
    return {
        "houses": [
            {
                "id": "h1",
                "address": "9482 Wildflower Ct",
                "listingUrl": "https://example.com/listing/9482-wildflower-ct",
                "city": "Highlands Ranch",
                "price": 615000,
                "estMonthlyPayment": 3980,
                "propertyTax": 4100,
                "hoa": 95,
                "sqft": 2450,
                "bedrooms": 4,
                "bathrooms": 3,
                "lotSize": "0.18 acre",
                "yearBuilt": 2001,
                "condition": 4,
                "requiredRepairs": "Furnace is original, may need replacement in 2-3 years.",
                "elementarySchoolId": "s1",
                "middleSchoolId": "s3",
                "highSchoolId": "s5",
                "commuteTimeMin": 32,
                "showingDate": "2026-08-02",
                "status": "Showing Scheduled",
                "followUpDate": "2026-08-03",
                "pros": "Fenced yard, finished basement, quiet cul-de-sac.",
                "cons": "Kitchen needs updating, no garage EV outlet.",
                "notes": "Neighbor mentioned HOA is planning a special assessment for the pool."
            },
            {
                "id": "h2",
                "address": "1207 Meadow Lark Dr",
                "listingUrl": "https://example.com/listing/1207-meadow-lark-dr",
                "city": "Parker",
                "price": 549900,
                "estMonthlyPayment": 3610,
                "propertyTax": 3550,
                "hoa": 60,
                "sqft": 2100,
                "bedrooms": 3,
                "bathrooms": 2.5,
                "lotSize": "0.15 acre",
                "yearBuilt": 1998,
                "condition": 3,
                "requiredRepairs": "Roof is ~18 years old, needs inspection. Deck needs restaining.",
                "elementarySchoolId": "s2",
                "middleSchoolId": "s4",
                "highSchoolId": "s6",
                "commuteTimeMin": 41,
                "showingDate": "2026-08-05",
                "status": "Researching",
                "followUpDate": "2026-07-31",
                "pros": "Great price per sqft, large backyard, low HOA.",
                "cons": "Longer commute, roof age is a concern.",
                "notes": "Ask seller for roof inspection report before scheduling a showing."
            },
            {
                "id": "h3",
                "address": "5560 Prairie Hawk Way",
                "listingUrl": "https://example.com/listing/5560-prairie-hawk-way",
                "city": "Castle Rock",
                "price": 674500,
                "estMonthlyPayment": 4350,
                "propertyTax": 4700,
                "hoa": 0,
                "sqft": 2800,
                "bedrooms": 4,
                "bathrooms": 3,
                "lotSize": "0.25 acre",
                "yearBuilt": 2015,
                "condition": 5,
                "requiredRepairs": "None known; move-in ready.",
                "elementarySchoolId": "s2",
                "middleSchoolId": "s4",
                "highSchoolId": "s6",
                "commuteTimeMin": 38,
                "showingDate": "2026-08-01",
                "status": "Showing Complete",
                "followUpDate": "2026-08-04",
                "pros": "No HOA, newer build, move-in ready, great school access.",
                "cons": "Highest price of the group, smaller lot than expected.",
                "notes": "Loved this one on the walkthrough. Discuss offer strategy."
            },
            {
                "id": "h4",
                "address": "8825 Timber Trail Ave",
                "listingUrl": "https://example.com/listing/8825-timber-trail-ave",
                "city": "Lone Tree",
                "price": 725000,
                "estMonthlyPayment": 4690,
                "propertyTax": 5100,
                "hoa": 140,
                "sqft": 2650,
                "bedrooms": 4,
                "bathrooms": 3.5,
                "lotSize": "0.16 acre",
                "yearBuilt": 2008,
                "condition": 4,
                "requiredRepairs": "Water heater original to house, budget for replacement.",
                "elementarySchoolId": "s1",
                "middleSchoolId": "s3",
                "highSchoolId": "s5",
                "commuteTimeMin": 27,
                "showingDate": "2026-08-09",
                "status": "Researching",
                "followUpDate": "2026-08-06",
                "pros": "Shortest commute, walkable to light rail, strong resale area.",
                "cons": "Highest HOA, above target budget.",
                "notes": "Stretch budget option; only pursue if h1/h3 fall through."
            },
            {
                "id": "h5",
                "address": "3391 Bell Mountain Cir",
                "listingUrl": "https://example.com/listing/3391-bell-mountain-cir",
                "city": "Castle Pines",
                "price": 599000,
                "estMonthlyPayment": 3870,
                "propertyTax": 3900,
                "hoa": 80,
                "sqft": 2300,
                "bedrooms": 3,
                "bathrooms": 2.5,
                "lotSize": "0.14 acre",
                "yearBuilt": 2003,
                "condition": 3,
                "requiredRepairs": "Carpet throughout needs replacing, minor drywall cracks.",
                "elementarySchoolId": "s2",
                "middleSchoolId": "s4",
                "highSchoolId": "s6",
                "commuteTimeMin": 35,
                "showingDate": "",
                "status": "Rejected",
                "followUpDate": "",
                "pros": "Good price, decent layout.",
                "cons": "Needs cosmetic work throughout, smallest bedrooms in the group.",
                "notes": "Passed after showing - layout felt cramped in person."
            }
        ],
        "schools": [
            {
                "id": "s1",
                "name": "Northridge Elementary School",
                "type": "Elementary",
                "gradesServed": "K-5",
                "curriculumModel": "Traditional",
                "cspfRating": "Accredited",
                "academicAchievement": 68,
                "academicGrowth": 72,
                "transportation": "Bus Provided",
                "enrollmentMethod": "Boundary",
                "applicationDeadline": "",
                "waitlistStatus": "None",
                "tourDate": "2026-08-14",
                "distances": [{"houseId": "h1", "miles": 0.9}, {"houseId": "h4", "miles": 1.4}],
                "pros": "Walkable for most of the boundary, active PTA.",
                "cons": "Portables in use due to enrollment growth.",
                "notes": ""
            },
            {
                "id": "s2",
                "name": "Buffalo Ridge Elementary School",
                "type": "Elementary",
                "gradesServed": "K-5",
                "curriculumModel": "Traditional",
                "cspfRating": "Distinguished",
                "academicAchievement": 81,
                "academicGrowth": 76,
                "transportation": "Bus Provided",
                "enrollmentMethod": "Boundary",
                "applicationDeadline": "",
                "waitlistStatus": "None",
                "tourDate": "2026-08-12",
                "distances": [{"houseId": "h2", "miles": 1.1}, {"houseId": "h3", "miles": 0.6}, {"houseId": "h5", "miles": 1.8}],
                "pros": "Top CSPF rating in the area, strong STEM program.",
                "cons": "Larger class sizes reported by current parents.",
                "notes": ""
            },
            {
                "id": "s3",
                "name": "Sagewood Middle School",
                "type": "Middle",
                "gradesServed": "6-8",
                "curriculumModel": "Traditional",
                "cspfRating": "Accredited",
                "academicAchievement": 64,
                "academicGrowth": 66,
                "transportation": "Bus Provided",
                "enrollmentMethod": "Boundary",
                "applicationDeadline": "",
                "waitlistStatus": "None",
                "tourDate": "2026-08-14",
                "distances": [{"houseId": "h1", "miles": 1.6}, {"houseId": "h4", "miles": 2.1}],
                "pros": "Well-regarded band and robotics programs.",
                "cons": "Aging building, renovation not yet scheduled.",
                "notes": ""
            },
            {
                "id": "s4",
                "name": "Mesa Middle School",
                "type": "Middle",
                "gradesServed": "6-8",
                "curriculumModel": "Traditional",
                "cspfRating": "Accredited",
                "academicAchievement": 70,
                "academicGrowth": 69,
                "transportation": "Bus Provided",
                "enrollmentMethod": "Boundary",
                "applicationDeadline": "",
                "waitlistStatus": "None",
                "tourDate": "2026-08-13",
                "distances": [{"houseId": "h2", "miles": 1.3}, {"houseId": "h3", "miles": 0.8}, {"houseId": "h5", "miles": 2.0}],
                "pros": "Newer facility, solid math scores.",
                "cons": "Limited elective variety compared to Sagewood.",
                "notes": ""
            },
            {
                "id": "s5",
                "name": "Mountain Vista High School",
                "type": "High",
                "gradesServed": "9-12",
                "curriculumModel": "Traditional + IB pathway",
                "cspfRating": "Distinguished",
                "academicAchievement": 79,
                "academicGrowth": 71,
                "transportation": "Bus Provided",
                "enrollmentMethod": "Boundary",
                "applicationDeadline": "",
                "waitlistStatus": "None",
                "tourDate": "2026-08-20",
                "distances": [{"houseId": "h1", "miles": 2.2}, {"houseId": "h4", "miles": 1.9}],
                "pros": "IB program, strong AP course catalog, large athletics program.",
                "cons": "Very large school (2,000+ students).",
                "notes": ""
            },
            {
                "id": "s6",
                "name": "Legend High School",
                "type": "High",
                "gradesServed": "9-12",
                "curriculumModel": "Traditional",
                "cspfRating": "Accredited",
                "academicAchievement": 73,
                "academicGrowth": 68,
                "transportation": "Bus Provided",
                "enrollmentMethod": "School Choice",
                "applicationDeadline": "2027-02-01",
                "waitlistStatus": "None",
                "tourDate": "2026-08-19",
                "distances": [{"houseId": "h2", "miles": 2.6}, {"houseId": "h3", "miles": 1.7}, {"houseId": "h5", "miles": 3.1}],
                "pros": "Strong career/tech education pathways, newer athletic facilities.",
                "cons": "School-choice seats fill up fast for out-of-boundary families.",
                "notes": "Since this is school-choice rather than boundary, confirm h3/h5 boundary status before counting on it."
            }
        ],
        "tasks": [
            {
                "id": "t1",
                "task": "Follow up with listing agent on 1207 Meadow Lark Dr roof inspection",
                "relatedType": "House",
                "relatedId": "h2",
                "owner": "Alex",
                "dueDate": "2026-07-31",
                "status": "Not Started",
                "priority": "High",
                "notes": ""
            },
            {
                "id": "t2",
                "task": "Submit pre-approval update to lender with latest pay stubs",
                "relatedType": "General",
                "relatedId": "",
                "owner": "Jordan",
                "dueDate": "2026-08-01",
                "status": "In Progress",
                "priority": "High",
                "notes": "Needed before we can make a competitive offer."
            },
            {
                "id": "t3",
                "task": "Book school tour for Northridge Elementary",
                "relatedType": "School",
                "relatedId": "s1",
                "owner": "Alex",
                "dueDate": "2026-08-10",
                "status": "Not Started",
                "priority": "Medium",
                "notes": "Tour already scheduled for 2026-08-14, just needs RSVP confirmation."
            },
            {
                "id": "t4",
                "task": "Decide on offer for 5560 Prairie Hawk Way",
                "relatedType": "House",
                "relatedId": "h3",
                "owner": "Jordan",
                "dueDate": "2026-08-04",
                "status": "Not Started",
                "priority": "High",
                "notes": "Top pick so far - discuss max offer price together first."
            },
            {
                "id": "t5",
                "task": "Order home inspection for 9482 Wildflower Ct if showing goes well",
                "relatedType": "House",
                "relatedId": "h1",
                "owner": "Alex",
                "dueDate": "2026-08-06",
                "status": "Not Started",
                "priority": "Medium",
                "notes": ""
            },
            {
                "id": "t6",
                "task": "Confirm Legend HS school-choice boundary rules with DCSD enrollment office",
                "relatedType": "School",
                "relatedId": "s6",
                "owner": "Jordan",
                "dueDate": "2026-07-30",
                "status": "Not Started",
                "priority": "Medium",
                "notes": ""
            },
            {
                "id": "t7",
                "task": "Send thank-you note after Castle Rock showing",
                "relatedType": "House",
                "relatedId": "h3",
                "owner": "Alex",
                "dueDate": "2026-07-20",
                "status": "Done",
                "priority": "Low",
                "notes": "Completed."
            }
        ],
        "weights": {
            "house": {"affordability": 30, "condition": 25, "commute": 25, "size": 20},
            "school": {"cspf": 30, "achievement": 25, "growth": 25, "transportation": 20},
            "enrollment": {"method": 60, "waitlist": 40}
        }
    }


# ---------------------------------------------------------------------------
# Scoring — ported from the House/School/Enrollment score math in
# static/app.js (computeHouseScores/computeSchoolScores/computeEnrollmentScores)
# so daily score snapshots can be taken server-side for sparkline history.
# ---------------------------------------------------------------------------
CSPF_POINTS = {
    "Distinguished": 100,
    "Accredited": 80,
    "Accredited-Improvement": 60,
    "Accredited-Priority-Improvement": 40,
    "Accredited-Turnaround": 20,
}
TRANSPORT_POINTS = {"Bus Provided": 100, "Bus for Fee": 60, "None": 0}
ENROLL_METHOD_POINTS = {"Boundary": 100, "School Choice": 60, "Lottery": 40, "Application": 20}

HOUSE_FACTORS = {
    "affordability": (lambda h: h.get("price"), False),
    "condition": (lambda h: h.get("condition"), True),
    "commute": (lambda h: h.get("commuteTimeMin"), False),
    "size": (lambda h: h.get("sqft"), True),
}


def _num_or_none(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _clamp_num(v):
    return max(0, min(100, v)) if isinstance(v, (int, float)) and not isinstance(v, bool) else 50


def _min_max(values):
    nums = [v for v in values if isinstance(v, (int, float)) and not isinstance(v, bool)]
    return (min(nums), max(nums)) if nums else (0, 0)


def _normalize_value(value, lo, hi, higher_is_better):
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return 50
    if hi == lo:
        return 100
    pct = (value - lo) / (hi - lo)
    if not higher_is_better:
        pct = 1 - pct
    return pct * 100


def _normalized_weights(weights_obj):
    total = sum(float(v or 0) for v in weights_obj.values()) or 1
    return {k: float(v or 0) / total * 100 for k, v in weights_obj.items()}


def compute_house_scores(houses, weights):
    w = _normalized_weights(weights or {})
    ranges = {key: _min_max([_num_or_none(getter(h)) for h in houses]) for key, (getter, _) in HOUSE_FACTORS.items()}
    result = {}
    for h in houses:
        total = 0
        for key, (getter, higher) in HOUSE_FACTORS.items():
            lo, hi = ranges[key]
            norm = _normalize_value(_num_or_none(getter(h)), lo, hi, higher)
            total += norm * w.get(key, 0) / 100
        result[h["id"]] = total
    return result


def compute_school_scores(schools, weights):
    w = _normalized_weights(weights or {})
    result = {}
    for s in schools:
        total = 0
        total += CSPF_POINTS.get(s.get("cspfRating"), 50) * w.get("cspf", 0) / 100
        total += _clamp_num(s.get("academicAchievement")) * w.get("achievement", 0) / 100
        total += _clamp_num(s.get("academicGrowth")) * w.get("growth", 0) / 100
        total += TRANSPORT_POINTS.get(s.get("transportation"), 50) * w.get("transportation", 0) / 100
        result[s["id"]] = total
    return result


def _waitlist_points(status):
    if not status or status == "None":
        return 100
    if status == "Closed":
        return 0
    m = re.search(r"(\d+)", status)
    if m:
        return max(10, 100 - int(m.group(1)) * 5)
    return 50


def compute_enrollment_scores(schools, weights):
    w = _normalized_weights(weights or {})
    result = {}
    for s in schools:
        method_norm = ENROLL_METHOD_POINTS.get(s.get("enrollmentMethod"), 50)
        waitlist_norm = _waitlist_points(s.get("waitlistStatus"))
        result[s["id"]] = method_norm * w.get("method", 0) / 100 + waitlist_norm * w.get("waitlist", 0) / 100
    return result


def _snapshot_kind(history, kind, scores, today):
    by_key = {(e.get("date"), e.get("kind"), e.get("id")): e for e in history}
    for item_id, score in scores.items():
        key = (today, kind, item_id)
        rounded = round(score, 1)
        if key in by_key:
            by_key[key]["score"] = rounded
        else:
            entry = {"date": today, "kind": kind, "id": item_id, "score": rounded}
            history.append(entry)
            by_key[key] = entry


def snapshot_scores(state):
    """Mutates state['scoreHistory'] in place with today's house/school/enrollment scores."""
    today = date.today().isoformat()
    history = state.setdefault("scoreHistory", [])
    weights = state.get("weights") or {}
    houses = state.get("houses") or []
    schools = state.get("schools") or []
    _snapshot_kind(history, "house", compute_house_scores(houses, weights.get("house")), today)
    _snapshot_kind(history, "school", compute_school_scores(schools, weights.get("school")), today)
    _snapshot_kind(history, "enrollment", compute_enrollment_scores(schools, weights.get("enrollment")), today)
    cutoff = (date.today() - timedelta(days=SCORE_HISTORY_DAYS)).isoformat()
    state["scoreHistory"] = [e for e in history if e.get("date", "") >= cutoff]


def load_state():
    if not DATA_FILE.exists():
        state = seed_state()
        save_state(state)
        return state
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(state):
    fd, tmp_path = tempfile.mkstemp(dir=BASE_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
        os.replace(tmp_path, DATA_FILE)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def backup_current_state():
    """Snapshot the on-disk state (pre-change) into backups/ and prune old snapshots."""
    if not DATA_FILE.exists():
        return
    BACKUPS_DIR.mkdir(exist_ok=True)
    dest = BACKUPS_DIR / f"data-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    if not dest.exists():
        dest.write_bytes(DATA_FILE.read_bytes())
    backups = sorted(BACKUPS_DIR.glob("data-*.json"))
    for stale in backups[:-MAX_BACKUPS]:
        stale.unlink()


# ---------------------------------------------------------------------------
# House file attachments (photos/documents) — stored on disk under
# uploads/<houseId>/, keyed purely by the client-generated house id. Not
# tracked in data.json; the file list is always read fresh from disk.
# ---------------------------------------------------------------------------
def _ext_of(filename):
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _house_upload_dir(house_id, create=False):
    d = UPLOADS_DIR / secure_filename(house_id)
    if create:
        d.mkdir(parents=True, exist_ok=True)
    return d


def _file_info(path):
    ext = _ext_of(path.name)
    stat = path.stat()
    return {
        "name": path.name,
        "kind": "photo" if ext in PHOTO_EXTS else "document",
        "size": stat.st_size,
        "uploadedAt": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


@app.route("/api/houses/<house_id>/files", methods=["GET"])
def list_house_files(house_id):
    d = _house_upload_dir(house_id)
    if not d.exists():
        return jsonify([])
    files = [_file_info(f) for f in d.iterdir() if f.is_file()]
    files.sort(key=lambda f: f["uploadedAt"], reverse=True)
    return jsonify(files)


@app.route("/api/houses/<house_id>/files", methods=["POST"])
def upload_house_file(house_id):
    if request.content_length and request.content_length > MAX_UPLOAD_BYTES:
        return jsonify({"error": "File too large (15MB max)."}), 413
    upload = request.files.get("file")
    if not upload or not upload.filename:
        return jsonify({"error": "No file provided."}), 400
    ext = _ext_of(upload.filename)
    if ext not in ALLOWED_UPLOAD_EXTS:
        return jsonify({"error": f"Unsupported file type: .{ext}"}), 400
    safe_name = secure_filename(upload.filename)
    if not safe_name:
        return jsonify({"error": "Invalid filename."}), 400
    stored_name = f"{datetime.now().strftime('%Y%m%d%H%M%S%f')}-{safe_name}"
    dest = _house_upload_dir(house_id, create=True) / stored_name
    upload.save(dest)
    if dest.stat().st_size > MAX_UPLOAD_BYTES:
        dest.unlink()
        return jsonify({"error": "File too large (15MB max)."}), 413
    return jsonify(_file_info(dest))


@app.route("/api/houses/<house_id>/files/<filename>", methods=["DELETE"])
def delete_house_file(house_id, filename):
    dest = _house_upload_dir(house_id) / secure_filename(filename)
    if dest.exists() and dest.is_file():
        dest.unlink()
    return jsonify({"ok": True})


@app.route("/api/houses/<house_id>/files", methods=["DELETE"])
def delete_all_house_files(house_id):
    d = _house_upload_dir(house_id)
    if d.exists():
        shutil.rmtree(d)
    return jsonify({"ok": True})


@app.route("/uploads/<house_id>/<filename>")
def serve_house_file(house_id, filename):
    return send_from_directory(_house_upload_dir(house_id), secure_filename(filename))


# ---------------------------------------------------------------------------
# Optional external integrations — all opt-in. Geocoding works with zero
# configuration (falls back to free OpenStreetMap Nominatim); live commute
# time and listing import need GEOCODE_API_KEY (a Google Maps API key) or
# network access respectively, and degrade to a clear error otherwise.
# ---------------------------------------------------------------------------
@app.route("/api/config")
def get_config():
    return jsonify({
        "geocodingProvider": "google" if GEOCODE_API_KEY else "nominatim",
        "commuteAvailable": bool(GEOCODE_API_KEY),
    })


def _geocode_google(address):
    resp = requests.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        params={"address": address, "key": GEOCODE_API_KEY},
        timeout=10,
    )
    data = resp.json()
    if data.get("status") != "OK" or not data.get("results"):
        return None, data.get("error_message") or f"Geocoding failed: {data.get('status')}"
    top = data["results"][0]
    loc = top["geometry"]["location"]
    return {"lat": loc["lat"], "lng": loc["lng"], "formattedAddress": top.get("formatted_address", address)}, None


def _geocode_nominatim(address):
    resp = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": address, "format": "json", "limit": 1},
        headers={"User-Agent": "house-hunt-tracker/1.0 (personal local use)"},
        timeout=10,
    )
    results = resp.json()
    if not results:
        return None, "No results found for that address."
    r = results[0]
    return {"lat": float(r["lat"]), "lng": float(r["lon"]), "formattedAddress": r.get("display_name", address)}, None


@app.route("/api/geocode", methods=["POST"])
def geocode():
    body = request.get_json(force=True, silent=True) or {}
    address = (body.get("address") or "").strip()
    if not address:
        return jsonify({"error": "Address is required."}), 400
    try:
        result, err = _geocode_google(address) if GEOCODE_API_KEY else _geocode_nominatim(address)
    except requests.RequestException as e:
        return jsonify({"error": f"Geocoding request failed: {e}"}), 502
    if err:
        return jsonify({"error": err}), 404
    return jsonify(result)


@app.route("/api/commute-time", methods=["POST"])
def commute_time():
    if not GEOCODE_API_KEY:
        return jsonify({"error": "Live commute time requires a Google Maps API key — set the GEOCODE_API_KEY environment variable, or enter commute time manually."}), 400
    body = request.get_json(force=True, silent=True) or {}
    origin = (body.get("origin") or "").strip()
    destination = (body.get("destination") or "").strip()
    if not origin or not destination:
        return jsonify({"error": "Both a house address and a commute destination are required."}), 400
    try:
        resp = requests.get(
            "https://maps.googleapis.com/maps/api/distancematrix/json",
            params={"origins": origin, "destinations": destination, "key": GEOCODE_API_KEY},
            timeout=10,
        )
        data = resp.json()
    except requests.RequestException as e:
        return jsonify({"error": f"Commute time request failed: {e}"}), 502
    try:
        element = data["rows"][0]["elements"][0]
        if element.get("status") != "OK":
            return jsonify({"error": f"Could not compute commute time: {element.get('status')}"}), 404
        minutes = round(element["duration"]["value"] / 60)
    except (KeyError, IndexError):
        return jsonify({"error": "Unexpected response from the Distance Matrix API."}), 502
    return jsonify({"minutes": minutes})


class _ListingMetaParser(HTMLParser):
    """Minimal best-effort extractor for og:*/title meta tags — listing sites
    vary wildly and many block scraping, so this only surfaces what a page
    voluntarily exposes via Open Graph tags; callers must treat it as partial."""

    def __init__(self):
        super().__init__()
        self.meta = {}
        self.title = None
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            key = attrs.get("property") or attrs.get("name")
            content = attrs.get("content")
            if key and content:
                self.meta[key.lower()] = content
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title = (self.title or "") + data


@app.route("/api/import-listing", methods=["POST"])
def import_listing():
    body = request.get_json(force=True, silent=True) or {}
    url = (body.get("url") or "").strip()
    if not url:
        return jsonify({"error": "A listing URL is required."}), 400
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return jsonify({"error": "Only http/https URLs are supported."}), 400
    try:
        resp = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; house-hunt-tracker/1.0; personal use)"},
            timeout=10,
            stream=True,
        )
        resp.raise_for_status()
        content = b""
        for chunk in resp.iter_content(chunk_size=8192):
            content += chunk
            if len(content) > IMPORT_LISTING_MAX_BYTES:
                break
    except requests.RequestException as e:
        return jsonify({"error": f"Could not fetch that URL: {e}"}), 502
    html_text = content.decode(resp.encoding or "utf-8", errors="ignore")
    parser = _ListingMetaParser()
    try:
        parser.feed(html_text)
    except Exception:
        pass
    meta = parser.meta
    price_source = " ".join(filter(None, [meta.get("og:title"), meta.get("og:description"), parser.title]))
    price_match = re.search(r"\$[\d,]{4,}", price_source)
    return jsonify({
        "title": parser.title,
        "ogTitle": meta.get("og:title"),
        "description": meta.get("og:description"),
        "image": meta.get("og:image"),
        "priceGuess": price_match.group(0) if price_match else None,
    })


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)


@app.route("/api/state", methods=["GET"])
def get_state():
    return jsonify(load_state())


@app.route("/api/state", methods=["PUT"])
def put_state():
    body = request.get_json(force=True, silent=False)
    if not isinstance(body, dict) or not all(k in body for k in ("houses", "schools", "tasks", "weights")):
        return jsonify({"error": "state must contain houses, schools, tasks, weights"}), 400
    if DATA_FILE.exists():
        try:
            current = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            current = None
        if current != body:
            backup_current_state()
    snapshot_scores(body)
    save_state(body)
    return jsonify(body)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    app.run(host="0.0.0.0", port=port, debug=False)
