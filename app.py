import json
import hashlib
import base64
import mimetypes
import os
import re
import secrets
import time
import urllib.request
from html import escape
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlencode, urljoin, urlparse
from urllib.request import Request, urlopen

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
except Exception:
    hashes = None
    serialization = None
    padding = None

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
UPLOADS_DIR = PUBLIC_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"
DATA_FILE = DATA_DIR / "content.json"
ANALYTICS_FILE = DATA_DIR / "analytics.json"
SHARE_DEBUG_FILE = DATA_DIR / "share-debug.json"
HOST = "127.0.0.1"
PORT = 3000
MAX_UPLOAD_SIZE = 5 * 1024 * 1024


def load_dotenv():
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return

    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        current = os.environ.get(key)
        if key and (current is None or not str(current).strip()):
            os.environ[key] = value


load_dotenv()

WECHAT_APP_ID = str(os.getenv("WECHAT_APP_ID", "")).strip()
WECHAT_APP_SECRET = str(os.getenv("WECHAT_APP_SECRET", "")).strip()
WECHAT_API_HOST = "https://api.weixin.qq.com"
WECHAT_PAY_API_HOST = "https://api.mch.weixin.qq.com"
WECHAT_PAY_APP_ID = str(os.getenv("WECHAT_PAY_APP_ID", WECHAT_APP_ID)).strip()
WECHAT_PAY_MCH_ID = str(os.getenv("WECHAT_PAY_MCH_ID", "")).strip()
WECHAT_PAY_SERIAL_NO = str(os.getenv("WECHAT_PAY_SERIAL_NO", "")).strip()
WECHAT_PAY_NOTIFY_URL = str(os.getenv("WECHAT_PAY_NOTIFY_URL", "")).strip()


def load_pem_value(raw_value: str, file_path: str):
    inline_value = str(raw_value or "").strip()
    if inline_value:
        return inline_value.replace("\\n", "\n")

    pem_path = str(file_path or "").strip()
    if not pem_path:
        return ""

    target = (BASE_DIR / pem_path).resolve()
    if not target.exists():
        return ""
    return target.read_text(encoding="utf-8").strip()


WECHAT_PAY_PRIVATE_KEY = load_pem_value(
    os.getenv("WECHAT_PAY_PRIVATE_KEY", ""),
    os.getenv("WECHAT_PAY_PRIVATE_KEY_PATH", ""),
)
WECHAT_CACHE = {
    "access_token": "",
    "access_token_expires_at": 0,
    "jsapi_ticket": "",
    "jsapi_ticket_expires_at": 0,
}
SITE_META = {
    "siteName": str(os.getenv("SITE_NAME", "知识库")).strip(),
    "siteShortName": str(os.getenv("SITE_SHORT_NAME", os.getenv("SITE_NAME", "知识库"))).strip(),
    "icpNumber": str(os.getenv("ICP_NUMBER", "")).strip(),
    "publicSecurityNumber": str(os.getenv("PUBLIC_SECURITY_NUMBER", "")).strip(),
    "publicSecurityUrl": str(os.getenv("PUBLIC_SECURITY_URL", "")).strip(),
    "companyName": str(os.getenv("COMPANY_NAME", "")).strip(),
    "contactEmail": str(os.getenv("CONTACT_EMAIL", "")).strip(),
    "contactPhone": str(os.getenv("CONTACT_PHONE", "")).strip(),
    "defaultShareImage": str(os.getenv("DEFAULT_SHARE_IMAGE", "")).strip(),
    "defaultCardName": str(os.getenv("DEFAULT_CARD_NAME", "")).strip(),
    "defaultCardRole": str(os.getenv("DEFAULT_CARD_ROLE", "资深金融顾问")).strip(),
    "defaultCardDescription": str(os.getenv("DEFAULT_CARD_DESCRIPTION", "")).strip(),
    "defaultCardAvatarUrl": str(os.getenv("DEFAULT_CARD_AVATAR_URL", "")).strip(),
    "defaultCardWechat": str(os.getenv("DEFAULT_CARD_WECHAT", "")).strip(),
    "defaultMiniProgramName": str(os.getenv("MINI_PROGRAM_NAME", "金象报告解析")).strip(),
    "defaultMiniProgramAppId": str(os.getenv("MINI_PROGRAM_APP_ID", "wxc068fe791aa69ee7")).strip(),
    "defaultMiniProgramOriginalId": str(os.getenv("MINI_PROGRAM_ORIGINAL_ID", "")).strip(),
    "defaultMiniProgramSharePage": str(os.getenv("MINI_PROGRAM_SHARE_PAGE", "/pages/h5-share-shell/h5-share-shell")).strip(),
    "defaultMiniProgramLaunchUrlTemplate": str(os.getenv("MINI_PROGRAM_LAUNCH_URL_TEMPLATE", "")).strip(),
    "defaultMiniProgramNote": str(
        os.getenv(
            "MINI_PROGRAM_NOTE",
            "当前内容已映射到现有小程序的分享壳页面，可先在小程序里测试朋友圈卡片，再回到 H5 查看落地效果。",
        )
    ).strip(),
}

# Lock H5 -> mini program mapping to the existing project we already patched under
# C:\Users\Administrator\Documents\jinxiang\golden-wx so production behavior is
# stable even if stale env vars or old admin data exist.
SITE_META["defaultMiniProgramName"] = "金象报告解析"
SITE_META["defaultMiniProgramAppId"] = "wxc068fe791aa69ee7"
SITE_META["defaultMiniProgramOriginalId"] = "gh_613042e245d1"
SITE_META["defaultMiniProgramSharePage"] = "/pages/h5-share-shell/h5-share-shell"

LOAN_GROUP_KEY = "loan-categories"
LOAN_SUBSECTIONS = [
    {"key": "bank-house-mortgage", "label": "\u94f6\u884c\u623f\u4ea7\u62b5\u62bc"},
    {"key": "bank-credit-loan", "label": "\u94f6\u884c\u4fe1\u7528\u8d37"},
    {"key": "private-house-mortgage", "label": "\u6c11\u95f4\u623f\u4ea7\u62b5\u62bc"},
    {"key": "redeem-bridge-funding", "label": "\u8d4e\u697c\u57ab\u8d44"},
    {"key": "car-loan", "label": "\u8f66\u8d37"},
]
TOOL_SUBSECTIONS = [{"key": "featured-tools", "label": "\u7cbe\u9009\u5de5\u5177"}]

DEFAULT_DATA = {
    "sections": {
        "home": {
            "label": "\u9996\u9875",
            "groups": [
                {
                    "key": LOAN_GROUP_KEY,
                    "label": "\u8d37\u6b3e\u79cd\u7c7b",
                    "children": LOAN_SUBSECTIONS,
                },
                {
                    "key": "tools-links",
                    "label": "\u5de5\u5177\u94fe\u63a5",
                    "children": TOOL_SUBSECTIONS,
                },
                {
                    "key": "article-center",
                    "label": "\u6587\u7ae0",
                    "adminOnly": True,
                    "children": [{"key": "featured-articles", "label": "\u7cbe\u9009\u6587\u7ae0"}],
                },
            ],
        },
        "recharge": {
            "label": "\u8d44\u6e90\u4e2d\u5fc3",
            "groups": [
                {
                    "key": "plans",
                    "label": "\u5145\u503c\u5957\u9910",
                    "children": [
                        {"key": "monthly", "label": "\u6708\u5ea6\u5957\u9910"},
                        {"key": "quarterly", "label": "\u5b63\u5ea6\u5957\u9910"},
                    ],
                }
            ],
        },
        "achievements": {
            "label": "\u6210\u957f\u4f53\u7cfb",
            "groups": [
                {
                    "key": "medals",
                    "label": "\u52cb\u7ae0\u4f53\u7cfb",
                    "children": [
                        {"key": "growth", "label": "\u6210\u957f\u52cb\u7ae0"},
                        {"key": "sales", "label": "\u4e1a\u7ee9\u52cb\u7ae0"},
                    ],
                }
            ],
        },
    },
    "contents": [],
    "notes": [],
    "growthCustomers": [],
    "userProfiles": {},
    "vipUsers": {},
    "rechargeOrders": [],
}

DEFAULT_ANALYTICS = {"users": {}, "events": []}


def ensure_json_file(file_path: Path, fallback: dict):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not file_path.exists():
        file_path.write_text(json.dumps(fallback, ensure_ascii=False, indent=2), encoding="utf-8")
        return

    try:
        json.loads(file_path.read_text(encoding="utf-8"))
    except Exception:
        file_path.write_text(json.dumps(fallback, ensure_ascii=False, indent=2), encoding="utf-8")


def ensure_data_files():
    ensure_json_file(DATA_FILE, DEFAULT_DATA)
    ensure_json_file(ANALYTICS_FILE, DEFAULT_ANALYTICS)
    ensure_json_file(SHARE_DEBUG_FILE, {"events": []})
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def read_json(file_path: Path):
    ensure_data_files()
    return json.loads(file_path.read_text(encoding="utf-8"))


def write_json(file_path: Path, data: dict):
    file_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def read_share_debug():
    return read_json(SHARE_DEBUG_FILE)


def write_share_debug(data: dict):
    write_json(SHARE_DEBUG_FILE, data)


def read_data():
    data = read_json(DATA_FILE)
    default_sections = DEFAULT_DATA.get("sections", {})
    current_sections = data.get("sections") if isinstance(data.get("sections"), dict) else {}

    for page_key, page_value in default_sections.items():
        current_page = current_sections.get(page_key) if isinstance(current_sections.get(page_key), dict) else {}
        current_groups = current_page.get("groups") if isinstance(current_page.get("groups"), list) else []
        merged_groups = list(current_groups)

        for default_group in page_value.get("groups", []):
            index = next((idx for idx, item in enumerate(merged_groups) if item.get("key") == default_group.get("key")), -1)
            if index < 0:
                merged_groups.append(default_group)
                continue

            existing_group = merged_groups[index]
            existing_children = existing_group.get("children") if isinstance(existing_group.get("children"), list) else []
            merged_children = list(existing_children)
            for default_child in default_group.get("children", []):
                if not any(item.get("key") == default_child.get("key") for item in merged_children):
                    merged_children.append(default_child)

            merged_groups[index] = {
                **default_group,
                **existing_group,
                "children": merged_children,
            }

        current_sections[page_key] = {
            **page_value,
            **current_page,
            "groups": merged_groups,
        }

    data["sections"] = current_sections
    if not isinstance(data.get("contents"), list):
        data["contents"] = []
    if not isinstance(data.get("notes"), list):
        data["notes"] = []
    if not isinstance(data.get("growthCustomers"), list):
        data["growthCustomers"] = []
    if not isinstance(data.get("userProfiles"), dict):
        data["userProfiles"] = {}
    if not isinstance(data.get("vipUsers"), dict):
        data["vipUsers"] = {}
    if not isinstance(data.get("rechargeOrders"), list):
        data["rechargeOrders"] = []
    return data


def write_data(data: dict):
    write_json(DATA_FILE, data)


def read_analytics():
    return read_json(ANALYTICS_FILE)


def write_analytics(data: dict):
    write_json(ANALYTICS_FILE, data)


def get_plan_catalog():
    return {
        "monthly": {
            "key": "monthly",
            "label": "月度 VIP",
            "price": 30,
            "durationDays": 30,
            "description": "30 元 / 月，开通后成为 VIP 用户。",
        },
        "quarterly": {
            "key": "quarterly",
            "label": "季度 VIP",
            "price": 88,
            "durationDays": 90,
            "description": "88 元 / 季度，开通后成为 VIP 用户。",
        },
    }


def normalize_vip_user_record(user_id: str, record: dict | None = None):
    current = record or {}
    return {
        "userId": str(user_id or current.get("userId", "")).strip(),
        "totalRechargeAmount": float(current.get("totalRechargeAmount", 0) or 0),
        "totalRechargeCount": int(current.get("totalRechargeCount", 0) or 0),
        "totalGrantedDays": int(current.get("totalGrantedDays", 0) or 0),
        "vipGrantedByAdminDays": int(current.get("vipGrantedByAdminDays", 0) or 0),
        "vipStartAt": str(current.get("vipStartAt", "")).strip(),
        "vipExpiresAt": str(current.get("vipExpiresAt", "")).strip(),
        "lastRechargeAt": str(current.get("lastRechargeAt", "")).strip(),
        "updatedAt": str(current.get("updatedAt", "")).strip(),
        "notes": str(current.get("notes", "")).strip(),
    }


def normalize_user_profile_record(user_id: str, record: dict | None = None):
    current = record or {}
    return {
        "userId": str(user_id or current.get("userId", "")).strip(),
        "avatarUrl": str(current.get("avatarUrl", "")).strip(),
        "name": str(current.get("name", "")).strip(),
        "title": str(current.get("title", "")).strip(),
        "introduction": str(current.get("introduction") or current.get("bio") or "").strip(),
        "phone": str(current.get("phone", "")).strip(),
        "wechat": str(current.get("wechat", "")).strip(),
        "createdAt": str(current.get("createdAt", "")).strip(),
        "updatedAt": str(current.get("updatedAt", "")).strip(),
    }


def get_user_profile(data: dict, user_id: str):
    current_user_id = str(user_id or "").strip()
    if not current_user_id:
        return None
    record = data.get("userProfiles", {}).get(current_user_id)
    if not isinstance(record, dict):
        return None
    return normalize_user_profile_record(current_user_id, record)


def sanitize_user_profile_payload(payload: dict):
    return {
        "previousUserId": str(payload.get("previousUserId", "")).strip(),
        "userId": str(payload.get("userId", "")).strip(),
        "avatarUrl": str(payload.get("avatarUrl", "")).strip(),
        "name": str(payload.get("name", "")).strip(),
        "title": str(payload.get("title", "")).strip(),
        "introduction": str(payload.get("introduction") or payload.get("bio") or "").strip(),
        "phone": str(payload.get("phone", "")).strip(),
        "wechat": str(payload.get("wechat", "")).strip(),
    }


def validate_user_profile_payload(payload: dict):
    if not payload["userId"]:
        return "userId required"
    if not payload["avatarUrl"]:
        return "avatarUrl required"
    if not payload["phone"]:
        return "phone required"
    return ""


def merge_analytics_user_records(current: dict | None = None, incoming: dict | None = None):
    base = current or {}
    next_item = incoming or {}
    merged_sections = dict(base.get("sections", {}))

    for key, value in (next_item.get("sections", {}) or {}).items():
        if key not in merged_sections:
            merged_sections[key] = value
            continue

        section = merged_sections[key]
        merged_sections[key] = {
            **section,
            **value,
            "clickCount": int(section.get("clickCount", 0) or 0) + int(value.get("clickCount", 0) or 0),
            "shareCount": int(section.get("shareCount", 0) or 0) + int(value.get("shareCount", 0) or 0),
            "firstClickedAt": sorted([str(section.get("firstClickedAt", "")), str(value.get("firstClickedAt", ""))])[0],
            "lastClickedAt": sorted([str(section.get("lastClickedAt", "")), str(value.get("lastClickedAt", ""))])[-1],
            "firstSharedAt": sorted([str(section.get("firstSharedAt", "")), str(value.get("firstSharedAt", ""))])[0],
            "lastSharedAt": sorted([str(section.get("lastSharedAt", "")), str(value.get("lastSharedAt", ""))])[-1],
        }

    return {
        **base,
        **next_item,
        "userId": str(next_item.get("userId") or base.get("userId") or "").strip(),
        "totalClicks": int(base.get("totalClicks", 0) or 0) + int(next_item.get("totalClicks", 0) or 0),
        "totalShares": int(base.get("totalShares", 0) or 0) + int(next_item.get("totalShares", 0) or 0),
        "firstSeenAt": sorted([str(base.get("firstSeenAt", "")), str(next_item.get("firstSeenAt", ""))])[0],
        "lastActiveAt": sorted([str(base.get("lastActiveAt", "")), str(next_item.get("lastActiveAt", ""))])[-1],
        "sections": merged_sections,
    }


def migrate_user_identity(data: dict, analytics: dict, previous_user_id: str, next_user_id: str):
    old_user_id = str(previous_user_id or "").strip()
    new_user_id = str(next_user_id or "").strip()
    if not old_user_id or not new_user_id or old_user_id == new_user_id:
        return

    if isinstance(data.get("userProfiles", {}).get(old_user_id), dict):
        existing_profile = data["userProfiles"].get(new_user_id, {})
        data["userProfiles"][new_user_id] = {
            **data["userProfiles"][old_user_id],
            **existing_profile,
            "userId": new_user_id,
        }
        data["userProfiles"].pop(old_user_id, None)

    if isinstance(data.get("vipUsers", {}).get(old_user_id), dict):
        current_record = normalize_vip_user_record(old_user_id, data["vipUsers"][old_user_id])
        existing_record = normalize_vip_user_record(new_user_id, data["vipUsers"][new_user_id]) if isinstance(data["vipUsers"].get(new_user_id), dict) else None
        if existing_record:
            data["vipUsers"][new_user_id] = {
                **existing_record,
                "userId": new_user_id,
                "totalRechargeAmount": existing_record["totalRechargeAmount"] + current_record["totalRechargeAmount"],
                "totalRechargeCount": existing_record["totalRechargeCount"] + current_record["totalRechargeCount"],
                "totalGrantedDays": existing_record["totalGrantedDays"] + current_record["totalGrantedDays"],
                "vipGrantedByAdminDays": existing_record["vipGrantedByAdminDays"] + current_record["vipGrantedByAdminDays"],
                "vipStartAt": [existing_record["vipStartAt"], current_record["vipStartAt"]][0] if not existing_record["vipStartAt"] else min(existing_record["vipStartAt"], current_record["vipStartAt"] or existing_record["vipStartAt"]),
                "vipExpiresAt": max(existing_record["vipExpiresAt"], current_record["vipExpiresAt"]),
                "lastRechargeAt": max(existing_record["lastRechargeAt"], current_record["lastRechargeAt"]),
                "updatedAt": max(existing_record["updatedAt"], current_record["updatedAt"]),
                "notes": " / ".join([item for item in [existing_record["notes"], current_record["notes"]] if item]),
            }
        else:
            data["vipUsers"][new_user_id] = {**current_record, "userId": new_user_id}
        data["vipUsers"].pop(old_user_id, None)

    if isinstance(data.get("rechargeOrders"), list):
        now = datetime.now(tz=timezone.utc).isoformat()
        data["rechargeOrders"] = [
            {**item, "userId": new_user_id, "updatedAt": now} if str(item.get("userId", "")).strip() == old_user_id else item
            for item in data["rechargeOrders"]
        ]

    users = analytics.get("users", {})
    if isinstance(users.get(old_user_id), dict):
        users[new_user_id] = merge_analytics_user_records(users.get(new_user_id, {}), users.get(old_user_id, {}))
        users[new_user_id]["userId"] = new_user_id
        users.pop(old_user_id, None)
    if isinstance(analytics.get("events"), list):
        analytics["events"] = [
            {**item, "userId": new_user_id} if str(item.get("userId", "")).strip() == old_user_id else item
            for item in analytics["events"]
        ]


def is_reserved_user_id(data: dict, analytics: dict, previous_user_id: str, target_user_id: str):
    old_user_id = str(previous_user_id or "").strip()
    new_user_id = str(target_user_id or "").strip()
    if not new_user_id or old_user_id == new_user_id:
        return False
    return bool(
        data.get("userProfiles", {}).get(new_user_id)
        or data.get("vipUsers", {}).get(new_user_id)
        or analytics.get("users", {}).get(new_user_id)
    )


def get_vip_status(record: dict):
    expires_at = str(record.get("vipExpiresAt", "")).strip()
    if not expires_at:
        return {"isVip": False, "remainingDays": 0, "remainingSeconds": 0}

    try:
        expires_at_dt = datetime.fromisoformat(expires_at)
    except ValueError:
        return {"isVip": False, "remainingDays": 0, "remainingSeconds": 0}

    now = datetime.now(tz=timezone.utc)
    if expires_at_dt.tzinfo is None:
        expires_at_dt = expires_at_dt.replace(tzinfo=timezone.utc)

    remaining_seconds = int((expires_at_dt - now).total_seconds())
    if remaining_seconds <= 0:
        return {"isVip": False, "remainingDays": 0, "remainingSeconds": 0}

    return {
        "isVip": True,
        "remainingDays": round(remaining_seconds / 86400, 2),
        "remainingSeconds": remaining_seconds,
    }


def build_vip_user_summary(data: dict, user_id: str, record: dict | None = None):
    current = normalize_vip_user_record(user_id, record)
    status = get_vip_status(current)
    analytics = read_analytics()
    analytics_user = analytics.get("users", {}).get(user_id, {})
    profile = get_user_profile(data, user_id)

    return {
        **current,
        **status,
        "profile": profile,
        "totalClicks": int(analytics_user.get("totalClicks", 0) or 0),
        "totalShares": int(analytics_user.get("totalShares", 0) or 0),
        "firstSeenAt": str(analytics_user.get("firstSeenAt", "")).strip(),
        "lastActiveAt": str(analytics_user.get("lastActiveAt", "")).strip(),
    }


def get_all_vip_user_summaries():
    data = read_data()
    analytics = read_analytics()
    user_ids = set(data.get("vipUsers", {}).keys()) | set(analytics.get("users", {}).keys())
    users = [
        build_vip_user_summary(data, user_id, data.get("vipUsers", {}).get(user_id, {}))
        for user_id in user_ids
    ]
    users.sort(
        key=lambda item: (
            int(bool(item.get("isVip"))),
            float(item.get("totalRechargeAmount", 0) or 0),
            str(item.get("lastActiveAt") or item.get("updatedAt") or ""),
        ),
        reverse=True,
    )
    return users


def add_vip_duration(record: dict, extra_days: int, *, from_recharge: bool = False, amount: float = 0, admin_grant: bool = False, notes: str = ""):
    safe_days = int(extra_days or 0)
    if safe_days <= 0:
        raise ValueError("vip duration days must be greater than 0")

    now = datetime.now(tz=timezone.utc)
    current_expire_at = str(record.get("vipExpiresAt", "")).strip()
    try:
        current_expire_dt = datetime.fromisoformat(current_expire_at) if current_expire_at else None
    except ValueError:
        current_expire_dt = None

    if current_expire_dt and current_expire_dt.tzinfo is None:
        current_expire_dt = current_expire_dt.replace(tzinfo=timezone.utc)

    base_dt = current_expire_dt if current_expire_dt and current_expire_dt > now else now
    next_expire_dt = base_dt + timedelta(days=safe_days)

    if not record.get("vipStartAt"):
        record["vipStartAt"] = now.isoformat()
    record["vipExpiresAt"] = next_expire_dt.isoformat()
    record["totalGrantedDays"] = int(record.get("totalGrantedDays", 0) or 0) + safe_days
    record["updatedAt"] = now.isoformat()

    if from_recharge:
        record["totalRechargeAmount"] = float(record.get("totalRechargeAmount", 0) or 0) + float(amount or 0)
        record["totalRechargeCount"] = int(record.get("totalRechargeCount", 0) or 0) + 1
        record["lastRechargeAt"] = now.isoformat()

    if admin_grant:
        record["vipGrantedByAdminDays"] = int(record.get("vipGrantedByAdminDays", 0) or 0) + safe_days

    if notes:
        record["notes"] = str(notes).strip()

    return record


def sanitize_vip_grant_payload(payload: dict):
    return {
        "userId": str(payload.get("userId", "")).strip(),
        "days": int(payload.get("days", 0) or 0),
        "notes": str(payload.get("notes", "")).strip(),
    }


def sanitize_recharge_order_payload(payload: dict):
    return {
        "userId": str(payload.get("userId", "")).strip(),
        "planKey": str(payload.get("planKey", "")).strip(),
        "paymentMethod": str(payload.get("paymentMethod", "")).strip().lower(),
        "paymentChannel": str(payload.get("paymentChannel", "")).strip().lower(),
        "returnUrl": str(payload.get("returnUrl", "")).strip(),
    }


def slugify(value: str):
    text = re.sub(r"[\s_]+", "-", str(value).strip().lower())
    text = re.sub(r"[^a-z0-9\u4e00-\u9fa5-]", "", text)
    text = re.sub(r"[\u4e00-\u9fa5]", "", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or "content"


def build_unique_slug(data: dict, payload: dict, ignore_id: str | None = None):
    base = slugify(f"{payload['page']}-{payload['groupKey']}-{payload['subKey']}-{payload['title']}")
    slug = base
    idx = 1

    while True:
        conflict = next(
            (
                item
                for item in data["contents"]
                if item["slug"] == slug and (ignore_id is None or item["id"] != ignore_id)
            ),
            None,
        )
        if not conflict:
            return slug
        idx += 1
        slug = f"{base}-{idx}"


def resolve_meta(data: dict, page: str, group_key: str, sub_key: str):
    page_cfg = data["sections"].get(page)
    if not page_cfg:
        return None

    group = next((item for item in page_cfg["groups"] if item["key"] == group_key), None)
    if not group:
        return None

    sub = next((item for item in group["children"] if item["key"] == sub_key), None)
    if not sub:
        return None

    return {
        "pageLabel": page_cfg["label"],
        "groupLabel": group["label"],
        "subLabel": sub["label"],
    }


def build_section_stat_key(page: str, group_key: str, sub_key: str):
    return f"{page}::{group_key}::{sub_key}"


def sanitize_tracking_payload(payload: dict):
    return {
        "userId": str(payload.get("userId", "")).strip(),
        "page": str(payload.get("page", "")).strip(),
        "groupKey": str(payload.get("groupKey", "")).strip(),
        "subKey": str(payload.get("subKey", "")).strip(),
        "contentId": str(payload.get("contentId", "")).strip(),
        "contentSlug": str(payload.get("contentSlug", "")).strip(),
        "contentTitle": str(payload.get("contentTitle", "")).strip(),
        "source": str(payload.get("source", "content-open")).strip(),
    }


def fetch_remote_json(path: str, params: dict):
    query = urlencode(params)
    url = f"{WECHAT_API_HOST}{path}?{query}"
    with urlopen(url, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def get_request_origin(handler: BaseHTTPRequestHandler):
    forwarded_proto = str(handler.headers.get("X-Forwarded-Proto", "")).split(",")[0].strip()
    protocol = forwarded_proto or "http"
    host = str(handler.headers.get("Host", "")).strip() or f"{HOST}:{PORT}"
    return f"{protocol}://{host}"


def get_request_ip(handler: BaseHTTPRequestHandler):
    forwarded_for = str(handler.headers.get("X-Forwarded-For", "")).split(",")[0].strip()
    real_ip = str(handler.headers.get("X-Real-IP", "")).strip()
    client_ip = forwarded_for or real_ip or (handler.client_address[0] if handler.client_address else "")
    return (client_ip or "127.0.0.1").replace("::ffff:", "")


def parse_request_cookies(handler: BaseHTTPRequestHandler):
    raw_cookie = str(handler.headers.get("Cookie", "")).strip()
    result = {}
    if not raw_cookie:
        return result

    for item in re.split(r";\s*", raw_cookie):
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        key = unquote(str(key or "").strip())
        value = unquote(str(value or "").strip())
        if key:
            result[key] = value
    return result


def get_wechat_openid_from_request(handler: BaseHTTPRequestHandler):
    return str(parse_request_cookies(handler).get("wechat_openid", "")).strip()


def is_wechat_browser_request(handler: BaseHTTPRequestHandler):
    return "micromessenger" in str(handler.headers.get("User-Agent", "")).lower()


def is_wechat_pay_configured():
    return bool(
        WECHAT_PAY_APP_ID
        and WECHAT_PAY_MCH_ID
        and WECHAT_PAY_SERIAL_NO
        and WECHAT_PAY_PRIVATE_KEY
        and hashes is not None
        and serialization is not None
        and padding is not None
    )


def sign_with_wechat_private_key(message: str):
    if not is_wechat_pay_configured():
        raise RuntimeError("wechat pay not configured")

    private_key = serialization.load_pem_private_key(
        WECHAT_PAY_PRIVATE_KEY.encode("utf-8"),
        password=None,
    )
    signature = private_key.sign(
        message.encode("utf-8"),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("utf-8")


def build_wechat_pay_authorization(method: str, request_path: str, body_text: str = ""):
    nonce_str = secrets.token_hex(16)
    timestamp = str(int(time.time()))
    message = f"{method.upper()}\n{request_path}\n{timestamp}\n{nonce_str}\n{body_text}\n"
    signature = sign_with_wechat_private_key(message)
    return (
        'WECHATPAY2-SHA256-RSA2048 '
        f'mchid="{WECHAT_PAY_MCH_ID}",'
        f'nonce_str="{nonce_str}",'
        f'timestamp="{timestamp}",'
        f'serial_no="{WECHAT_PAY_SERIAL_NO}",'
        f'signature="{signature}"'
    )


def call_wechat_pay_api(method: str, request_path: str, body: dict | None = None):
    payload_text = json.dumps(body or {}, ensure_ascii=False, separators=(",", ":")) if method.upper() != "GET" else ""
    url = f"{WECHAT_PAY_API_HOST}{request_path}"
    headers = {
        "Accept": "application/json",
        "Authorization": build_wechat_pay_authorization(method, request_path, payload_text),
        "Content-Type": "application/json",
        "User-Agent": "zhishiku-h5-python/1.0",
    }

    request = Request(
        url,
        data=payload_text.encode("utf-8") if payload_text else None,
        headers=headers,
        method=method.upper(),
    )

    try:
        with urlopen(request, timeout=12) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw or "{}")
    except HTTPError as error:
        raw = error.read().decode("utf-8")
        try:
            parsed = json.loads(raw or "{}")
        except Exception:
            parsed = {"message": raw or f"wechat pay request failed with status {error.code}"}
        raise RuntimeError(parsed.get("message") or parsed.get("detail") or f"wechat pay request failed with status {error.code}")


def get_wechat_pay_notify_url(handler: BaseHTTPRequestHandler):
    if WECHAT_PAY_NOTIFY_URL:
        return WECHAT_PAY_NOTIFY_URL
    return f"{get_request_origin(handler)}/api/wechat/pay/notify"


def get_wechat_access_token():
    now = int(time.time())
    if WECHAT_CACHE["access_token"] and WECHAT_CACHE["access_token_expires_at"] > now:
        return WECHAT_CACHE["access_token"]

    result = fetch_remote_json(
        "/cgi-bin/token",
        {
            "grant_type": "client_credential",
            "appid": WECHAT_APP_ID,
            "secret": WECHAT_APP_SECRET,
        },
    )
    if result.get("errcode"):
        raise RuntimeError(result.get("errmsg") or "failed to fetch access_token")

    token = str(result.get("access_token", "")).strip()
    expires_in = int(result.get("expires_in", 0))
    if not token or not expires_in:
        raise RuntimeError("failed to fetch access_token")

    WECHAT_CACHE["access_token"] = token
    WECHAT_CACHE["access_token_expires_at"] = now + max(expires_in - 120, 60)
    return token


def get_wechat_jsapi_ticket():
    now = int(time.time())
    if WECHAT_CACHE["jsapi_ticket"] and WECHAT_CACHE["jsapi_ticket_expires_at"] > now:
        return WECHAT_CACHE["jsapi_ticket"]

    access_token = get_wechat_access_token()
    result = fetch_remote_json(
        "/cgi-bin/ticket/getticket",
        {
            "access_token": access_token,
            "type": "jsapi",
        },
    )
    if int(result.get("errcode", -1)) != 0:
        raise RuntimeError(result.get("errmsg") or "failed to fetch jsapi_ticket")

    ticket = str(result.get("ticket", "")).strip()
    expires_in = int(result.get("expires_in", 0))
    if not ticket or not expires_in:
        raise RuntimeError("failed to fetch jsapi_ticket")

    WECHAT_CACHE["jsapi_ticket"] = ticket
    WECHAT_CACHE["jsapi_ticket_expires_at"] = now + max(expires_in - 120, 60)
    return ticket


def build_wechat_signature(target_url: str):
    ticket = get_wechat_jsapi_ticket()
    nonce_str = secrets.token_hex(8)
    timestamp = int(time.time())
    raw = (
        f"jsapi_ticket={ticket}"
        f"&noncestr={nonce_str}"
        f"&timestamp={timestamp}"
        f"&url={target_url}"
    )
    signature = hashlib.sha1(raw.encode("utf-8")).hexdigest()
    return {
        "appId": WECHAT_APP_ID,
        "timestamp": timestamp,
        "nonceStr": nonce_str,
        "signature": signature,
    }


def sanitize_wechat_redirect_url(handler: BaseHTTPRequestHandler, raw_url: str):
    candidate = str(raw_url or "").strip() or f"{get_request_origin(handler)}/recharge.html"
    parsed = urlparse(urljoin(get_request_origin(handler), candidate))
    if parsed.scheme not in {"http", "https"}:
        raise RuntimeError("oauth redirect url must use http or https")
    return parsed._replace(fragment="").geturl()


def get_wechat_oauth_openid(code: str):
    result = fetch_remote_json(
        "/sns/oauth2/access_token",
        {
            "appid": WECHAT_APP_ID,
            "secret": WECHAT_APP_SECRET,
            "code": code,
            "grant_type": "authorization_code",
        },
    )
    openid = str(result.get("openid", "")).strip()
    if not openid:
        raise RuntimeError(result.get("errmsg") or "failed to fetch oauth openid")
    return openid


def create_wechat_h5_transaction(handler: BaseHTTPRequestHandler, order: dict):
    return call_wechat_pay_api(
        "POST",
        "/v3/pay/transactions/h5",
        {
            "appid": WECHAT_PAY_APP_ID,
            "mchid": WECHAT_PAY_MCH_ID,
            "description": f"{SITE_META['siteShortName'] or SITE_META['siteName'] or '知识库'} {order['planLabel']}".strip(),
            "out_trade_no": order["id"],
            "notify_url": get_wechat_pay_notify_url(handler),
            "amount": {
                "total": int(round(float(order.get("amount", 0) or 0) * 100)),
                "currency": "CNY",
            },
            "scene_info": {
                "payer_client_ip": get_request_ip(handler),
                "h5_info": {
                    "type": "Wap",
                    "app_name": SITE_META["siteShortName"] or SITE_META["siteName"] or "知识库",
                    "app_url": get_request_origin(handler),
                },
            },
        },
    )


def create_wechat_jsapi_transaction(handler: BaseHTTPRequestHandler, order: dict, openid: str):
    return call_wechat_pay_api(
        "POST",
        "/v3/pay/transactions/jsapi",
        {
            "appid": WECHAT_PAY_APP_ID,
            "mchid": WECHAT_PAY_MCH_ID,
            "description": f"{SITE_META['siteShortName'] or SITE_META['siteName'] or '知识库'} {order['planLabel']}".strip(),
            "out_trade_no": order["id"],
            "notify_url": get_wechat_pay_notify_url(handler),
            "amount": {
                "total": int(round(float(order.get("amount", 0) or 0) * 100)),
                "currency": "CNY",
            },
            "payer": {"openid": openid},
        },
    )


def build_wechat_jsapi_pay_params(prepay_id: str):
    timestamp = str(int(time.time()))
    nonce_str = secrets.token_hex(16)
    package_value = f"prepay_id={prepay_id}"
    sign_message = f"{WECHAT_PAY_APP_ID}\n{timestamp}\n{nonce_str}\n{package_value}\n"
    return {
        "appId": WECHAT_PAY_APP_ID,
        "timeStamp": timestamp,
        "nonceStr": nonce_str,
        "package": package_value,
        "signType": "RSA",
        "paySign": sign_with_wechat_private_key(sign_message),
    }


def query_wechat_transaction(order_id: str):
    return call_wechat_pay_api(
        "GET",
        f"/v3/pay/transactions/out-trade-no/{quote(order_id)}?mchid={quote(WECHAT_PAY_MCH_ID)}",
    )


def normalize_recharge_order(order: dict | None = None):
    current = order or {}
    return {
        "id": str(current.get("id", "")).strip(),
        "userId": str(current.get("userId", "")).strip(),
        "planKey": str(current.get("planKey", "")).strip(),
        "planLabel": str(current.get("planLabel", "")).strip(),
        "amount": float(current.get("amount", 0) or 0),
        "durationDays": int(current.get("durationDays", 0) or 0),
        "paymentMethod": str(current.get("paymentMethod", "")).strip().lower(),
        "paymentChannel": str(current.get("paymentChannel", "h5")).strip().lower() or "h5",
        "status": str(current.get("status", "pending")).strip(),
        "paymentStatus": str(current.get("paymentStatus", "pending")).strip(),
        "gateway": str(current.get("gateway", "")).strip(),
        "gatewayMessage": str(current.get("gatewayMessage", "")).strip(),
        "gatewayTransactionId": str(current.get("gatewayTransactionId", "")).strip(),
        "wechatH5Url": str(current.get("wechatH5Url", "")).strip(),
        "tradeState": str(current.get("tradeState", "")).strip(),
        "tradeStateDesc": str(current.get("tradeStateDesc", "")).strip(),
        "paidAt": str(current.get("paidAt", "")).strip(),
        "createdAt": str(current.get("createdAt", "")).strip(),
        "updatedAt": str(current.get("updatedAt", "")).strip(),
    }


def find_recharge_order_index(data: dict, order_id: str):
    target = str(order_id or "").strip()
    for index, item in enumerate(data.get("rechargeOrders", [])):
        if str(item.get("id", "")).strip() == target:
            return index
    return -1


def apply_recharge_order_state(data: dict, order_index: int, query_result: dict):
    existing = normalize_recharge_order(data["rechargeOrders"][order_index])
    next_order = {
        **existing,
        "tradeState": str(query_result.get("trade_state", existing.get("tradeState", ""))).strip(),
        "tradeStateDesc": str(query_result.get("trade_state_desc", existing.get("tradeStateDesc", ""))).strip(),
        "gatewayTransactionId": str(query_result.get("transaction_id", existing.get("gatewayTransactionId", ""))).strip(),
        "updatedAt": datetime.now(tz=timezone.utc).isoformat(),
    }

    if next_order["tradeState"] == "SUCCESS":
        if existing.get("paymentStatus") != "paid":
            current_vip = normalize_vip_user_record(next_order["userId"], data.get("vipUsers", {}).get(next_order["userId"], {}))
            updated_vip = add_vip_duration(
                current_vip,
                next_order["durationDays"],
                from_recharge=True,
                amount=next_order["amount"],
            )
            data.setdefault("vipUsers", {})[next_order["userId"]] = updated_vip

        next_order["status"] = "paid"
        next_order["paymentStatus"] = "paid"
        next_order["gatewayMessage"] = next_order["tradeStateDesc"] or "微信支付成功"
        next_order["paidAt"] = str(query_result.get("success_time") or existing.get("paidAt") or next_order["updatedAt"]).strip()
    elif next_order["tradeState"] in {"CLOSED", "REVOKED", "PAYERROR"}:
        next_order["status"] = "closed"
        next_order["paymentStatus"] = "closed"
        next_order["gatewayMessage"] = next_order["tradeStateDesc"] or "订单已关闭"
    elif next_order["tradeState"]:
        next_order["status"] = "pending"
        next_order["paymentStatus"] = "awaiting_payment"
        next_order["gatewayMessage"] = next_order["tradeStateDesc"] or "等待用户支付"

    data["rechargeOrders"][order_index] = next_order
    return next_order


def build_user_state(data: dict, user_id: str):
    safe_user_id = str(user_id or "").strip()
    return {
        "userId": safe_user_id,
        "profile": get_user_profile(data, safe_user_id) if safe_user_id else None,
        "vip": build_vip_user_summary(data, safe_user_id, data.get("vipUsers", {}).get(safe_user_id, {})) if safe_user_id else None,
    }


def record_tracking_event(payload: dict):
    data = read_data()
    meta = resolve_meta(data, payload["page"], payload["groupKey"], payload["subKey"])
    if not meta:
        return {"error": "page/groupKey/subKey invalid"}

    analytics = read_analytics()
    now = datetime.now(tz=timezone.utc).isoformat()
    stat_key = build_section_stat_key(payload["page"], payload["groupKey"], payload["subKey"])

    if payload["userId"] not in analytics["users"]:
        analytics["users"][payload["userId"]] = {
            "userId": payload["userId"],
            "totalClicks": 0,
            "firstSeenAt": now,
            "lastActiveAt": now,
            "sections": {},
        }

    user = analytics["users"][payload["userId"]]
    if stat_key not in user["sections"]:
        user["sections"][stat_key] = {
            "page": payload["page"],
            "groupKey": payload["groupKey"],
            "subKey": payload["subKey"],
            "clickCount": 0,
            "firstClickedAt": now,
            "lastClickedAt": now,
            "recentContentTitle": payload["contentTitle"],
            "recentContentSlug": payload["contentSlug"],
        }

    section = user["sections"][stat_key]
    user["totalClicks"] += 1
    user["lastActiveAt"] = now
    section["clickCount"] += 1
    section["lastClickedAt"] = now

    if payload["contentTitle"]:
        section["recentContentTitle"] = payload["contentTitle"]
    if payload["contentSlug"]:
        section["recentContentSlug"] = payload["contentSlug"]

    analytics["events"].insert(
        0,
        {
            "id": f"event-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}",
            "userId": payload["userId"],
            "page": payload["page"],
            "groupKey": payload["groupKey"],
            "subKey": payload["subKey"],
            "contentId": payload["contentId"],
            "contentSlug": payload["contentSlug"],
            "contentTitle": payload["contentTitle"],
            "source": payload["source"],
            "createdAt": now,
        },
    )
    analytics["events"] = analytics["events"][:5000]
    write_analytics(analytics)

    return {"event": analytics["events"][0]}


def build_analytics_response(selected_user_id: str = ""):
    data = read_data()
    analytics = read_analytics()

    users = []
    for user in analytics["users"].values():
        section_stats = []
        for item in user.get("sections", {}).values():
            meta = resolve_meta(data, item["page"], item["groupKey"], item["subKey"]) or {}
            percentage = round((item["clickCount"] / user["totalClicks"]) * 100, 2) if user["totalClicks"] else 0
            section_stats.append({**item, **meta, "percentage": percentage})

        section_stats.sort(key=lambda current: current["clickCount"], reverse=True)
        users.append(
            {
                "userId": user["userId"],
                "totalClicks": user["totalClicks"],
                "firstSeenAt": user["firstSeenAt"],
                "lastActiveAt": user["lastActiveAt"],
                "topSection": section_stats[0] if section_stats else None,
                "sectionStats": section_stats,
            }
        )

    users.sort(key=lambda current: current["totalClicks"], reverse=True)

    subsection_map = {}
    for user in users:
        for item in user["sectionStats"]:
            stat_key = build_section_stat_key(item["page"], item["groupKey"], item["subKey"])
            if stat_key not in subsection_map:
                subsection_map[stat_key] = {
                    "page": item["page"],
                    "groupKey": item["groupKey"],
                    "subKey": item["subKey"],
                    "pageLabel": item.get("pageLabel", ""),
                    "groupLabel": item.get("groupLabel", ""),
                    "subLabel": item.get("subLabel", ""),
                    "totalClicks": 0,
                    "userCount": 0,
                }
            subsection_map[stat_key]["totalClicks"] += item["clickCount"]
            subsection_map[stat_key]["userCount"] += 1

    subsection_stats = sorted(subsection_map.values(), key=lambda current: current["totalClicks"], reverse=True)
    selected_user = next((item for item in users if item["userId"] == selected_user_id), None) if selected_user_id else None

    return {
        "overview": {
            "totalUsers": len(users),
            "totalClicks": sum(item["totalClicks"] for item in users),
            "subsectionStats": subsection_stats,
            "recentEvents": analytics["events"][:30],
        },
        "users": users,
        "selectedUser": selected_user,
    }


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict, include_body: bool = True):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    if include_body:
        handler.wfile.write(body)


def send_file(handler: BaseHTTPRequestHandler, file_path: Path, include_body: bool = True):
    if not file_path.exists() or not file_path.is_file():
        handler.send_error(404, "Not Found")
        return

    mime_type, _ = mimetypes.guess_type(str(file_path))
    body = file_path.read_bytes()

    handler.send_response(200)
    handler.send_header("Content-Type", mime_type or "application/octet-stream")
    if file_path.suffix.lower() in {".html", ".js", ".css"}:
        handler.send_header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
        handler.send_header("Pragma", "no-cache")
        handler.send_header("Expires", "0")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    if include_body:
        handler.wfile.write(body)


def send_html(handler: BaseHTTPRequestHandler, html: str, status: int = 200, include_body: bool = True):
    body = html.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
    handler.send_header("Pragma", "no-cache")
    handler.send_header("Expires", "0")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    if include_body:
        handler.wfile.write(body)


def parse_json_body(handler: BaseHTTPRequestHandler):
    raw_len = int(handler.headers.get("Content-Length", "0"))
    raw_body = handler.rfile.read(raw_len)
    try:
        return json.loads(raw_body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return None


def strip_html(value: str):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]*>", " ", str(value or ""))).strip()


def get_request_origin(handler: BaseHTTPRequestHandler):
    forwarded_proto = str(handler.headers.get("X-Forwarded-Proto", "")).split(",")[0].strip()
    proto = forwarded_proto or "http"
    host = str(handler.headers.get("Host", "")).strip() or f"{HOST}:{PORT}"
    return f"{proto}://{host}"


def build_content_share_version(content: dict):
    value = (
        str(content.get("updatedAt", "")).strip()
        or str(content.get("createdAt", "")).strip()
        or str(content.get("shareImageUrl", "")).strip()
        or str(content.get("title", "")).strip()
    )
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:12] if value else ""


def build_content_share_path(content: dict):
    slug = quote(str(content.get("slug", "")).strip(), safe="")
    if not slug:
        return ""

    share_version = build_content_share_version(content)
    return f"/content/{slug}?sharev={share_version}" if share_version else f"/content/{slug}"


def build_content_mini_program_path(content: dict):
    share_page = str(SITE_META.get("defaultMiniProgramSharePage", "")).strip()
    slug = str(content.get("slug", "")).strip()
    if not share_page:
        return ""
    if not slug:
        return share_page

    query = urlencode({"slug": slug})
    separator = "&" if "?" in share_page else "?"
    return f"{share_page}{separator}{query}"


def build_content_mini_program_launch_url(content: dict):
    template = str(SITE_META.get("defaultMiniProgramLaunchUrlTemplate", "")).strip()
    if not template:
        return ""

    mini_program_path = build_content_mini_program_path(content)
    share_path = build_content_share_path(content)
    replacements = {
        "{path}": mini_program_path,
        "{path_encoded}": quote(mini_program_path, safe=""),
        "{link}": share_path,
        "{link_encoded}": quote(share_path, safe=""),
        "{slug}": str(content.get("slug", "")).strip(),
    }

    launch_url = template
    for key, value in replacements.items():
        launch_url = launch_url.replace(key, value)
    return launch_url


def enrich_content_item(content: dict):
    current = dict(content or {})
    mini_program_path = str(current.get("miniProgramPath", "")).strip() or build_content_mini_program_path(current)
    mini_program_launch_url = (
        str(current.get("miniProgramLaunchUrl", "")).strip() or build_content_mini_program_launch_url(current)
    )

    return {
        **current,
        "link": build_content_share_path(current),
        "miniProgramName": str(current.get("miniProgramName", "")).strip()
        or str(SITE_META.get("defaultMiniProgramName", "")).strip(),
        "miniProgramAppId": str(current.get("miniProgramAppId", "")).strip()
        or str(SITE_META.get("defaultMiniProgramAppId", "")).strip(),
        "miniProgramOriginalId": str(current.get("miniProgramOriginalId", "")).strip()
        or str(SITE_META.get("defaultMiniProgramOriginalId", "")).strip(),
        "miniProgramPath": mini_program_path,
        "miniProgramLaunchUrl": mini_program_launch_url,
        "miniProgramNote": str(current.get("miniProgramNote", "")).strip()
        or str(SITE_META.get("defaultMiniProgramNote", "")).strip(),
    }


def build_content_page_meta(handler: BaseHTTPRequestHandler, content: dict):
    site_name = str(SITE_META.get("siteName", "")).strip() or "知识库"
    title = str(content.get("title", "")).strip() or site_name
    page_title = f"{title} - {site_name}" if title and site_name else title or site_name
    description = (
        strip_html(content.get("summary", ""))
        or strip_html(content.get("body", ""))[:120]
        or f"{title or site_name}，来自{site_name}"
    )
    origin = get_request_origin(handler)
    url = urljoin(origin, handler.path or build_content_share_path(content))
    image = urljoin(origin, str(content.get("shareImageUrl") or SITE_META.get("defaultShareImage") or "").strip())

    return {
        "title": title,
        "pageTitle": page_title,
        "description": description,
        "url": url,
        "image": image,
        "siteName": site_name,
    }


def render_detail_html(handler: BaseHTTPRequestHandler, content: dict):
    template = (PUBLIC_DIR / "detail.html").read_text(encoding="utf-8")
    meta = build_content_page_meta(handler, content)
    meta_tags = [
        f'<meta name="description" content="{escape(meta["description"], quote=True)}" />',
        '<meta property="og:type" content="article" />',
        f'<meta property="og:title" content="{escape(meta["title"], quote=True)}" />',
        f'<meta property="og:description" content="{escape(meta["description"], quote=True)}" />',
        f'<meta property="og:url" content="{escape(meta["url"], quote=True)}" />',
        f'<meta property="og:image" content="{escape(meta["image"], quote=True)}" />' if meta["image"] else "",
        f'<meta property="og:image:url" content="{escape(meta["image"], quote=True)}" />' if meta["image"] else "",
        f'<meta property="og:image:secure_url" content="{escape(meta["image"], quote=True)}" />' if meta["image"] else "",
        '<meta property="og:image:width" content="300" />' if meta["image"] else "",
        '<meta property="og:image:height" content="300" />' if meta["image"] else "",
        f'<meta property="og:site_name" content="{escape(meta["siteName"], quote=True)}" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        f'<meta name="twitter:title" content="{escape(meta["title"], quote=True)}" />',
        f'<meta name="twitter:description" content="{escape(meta["description"], quote=True)}" />',
        f'<meta name="twitter:image" content="{escape(meta["image"], quote=True)}" />' if meta["image"] else "",
        f'<link rel="canonical" href="{escape(meta["url"], quote=True)}" />',
    ]
    head_markup = "\n    ".join(item for item in meta_tags if item)
    html = re.sub(r"<title>[\s\S]*?</title>", f"<title>{escape(meta['pageTitle'])}</title>", template, count=1)
    return html.replace("</head>", f"    {head_markup}\n  </head>", 1)


def build_upload_filename(original_name: str, content_type: str):
    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "-", str(original_name or "").strip())
    suffix = Path(safe_name).suffix.lower()
    guessed_suffix = mimetypes.guess_extension(str(content_type or "").strip()) or ""
    allowed_suffixes = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

    if suffix not in allowed_suffixes:
      suffix = guessed_suffix if guessed_suffix in allowed_suffixes else ".jpg"

    return f"{int(time.time() * 1000)}-{secrets.token_hex(6)}{suffix}"


def save_uploaded_image(payload: dict):
    raw_data = str(payload.get("data", "")).strip()
    file_name = str(payload.get("filename", "")).strip()
    content_type = str(payload.get("contentType", "")).strip().lower()

    if not raw_data:
        raise ValueError("image data required")

    if not content_type.startswith("image/"):
        raise ValueError("only image uploads are supported")

    try:
        binary = base64.b64decode(raw_data, validate=True)
    except Exception as error:
        raise ValueError("invalid image data") from error

    if not binary:
        raise ValueError("image data required")

    if len(binary) > MAX_UPLOAD_SIZE:
        raise ValueError("image must be 5MB or smaller")

    ensure_data_files()
    final_name = build_upload_filename(file_name, content_type)
    target_path = UPLOADS_DIR / final_name
    target_path.write_bytes(binary)

    return {
        "url": f"/uploads/{final_name}",
        "name": final_name,
        "size": len(binary),
    }


def sanitize_content_payload(payload: dict):
    return {
        "page": str(payload.get("page", "")).strip(),
        "groupKey": str(payload.get("groupKey", "")).strip(),
        "subKey": str(payload.get("subKey", "")).strip(),
        "title": str(payload.get("title", "")).strip(),
        "summary": str(payload.get("summary", "")).strip(),
        "body": str(payload.get("body", "")).strip(),
        "externalUrl": str(payload.get("externalUrl", "")).strip(),
        "contentType": str(payload.get("contentType", "article")).strip() or "article",
        "shareImageUrl": str(payload.get("shareImageUrl", "")).strip(),
        "miniProgramName": str(payload.get("miniProgramName", "")).strip(),
        "miniProgramAppId": str(payload.get("miniProgramAppId", "")).strip(),
        "miniProgramPath": str(payload.get("miniProgramPath", "")).strip(),
        "miniProgramLaunchUrl": str(payload.get("miniProgramLaunchUrl", "")).strip(),
        "miniProgramNote": str(payload.get("miniProgramNote", "")).strip(),
    }


def sanitize_note_payload(payload: dict):
    return {
        "title": str(payload.get("title", "")).strip(),
        "body": str(payload.get("body", "")).strip(),
        "category": str(payload.get("category", "")).strip(),
        "pinned": bool(payload.get("pinned", False)),
    }


def clamp_growth_progress(value):
    try:
        progress = float(value)
    except (TypeError, ValueError):
        progress = 0
    return max(0, min(100, int(progress)))


def sanitize_growth_project_payload(payload: dict):
    progress = clamp_growth_progress(payload.get("progress", 0))
    status = str(payload.get("status", "")).strip().lower()
    if status != "completed":
        status = "in_progress"
    if progress >= 100:
        status = "completed"
    if status == "completed" and progress < 100:
        progress = 100

    return {
        "loanProject": str(payload.get("loanProject") or payload.get("projectName") or "").strip(),
        "amount": str(payload.get("amount", "")).strip(),
        "details": str(payload.get("details", "")).strip(),
        "progress": progress,
        "status": status,
    }


def sanitize_growth_customer_create_payload(payload: dict):
    return {
        "customerName": str(payload.get("customerName", "")).strip(),
        "avatarUrl": str(payload.get("avatarUrl", "")).strip(),
        "project": sanitize_growth_project_payload(payload),
    }


def sanitize_growth_project_update_payload(payload: dict):
    updated = {}

    if "loanProject" in payload or "projectName" in payload:
        updated["loanProject"] = str(payload.get("loanProject") or payload.get("projectName") or "").strip()
    if "amount" in payload:
        updated["amount"] = str(payload.get("amount", "")).strip()
    if "details" in payload:
        updated["details"] = str(payload.get("details", "")).strip()
    if "progress" in payload:
        updated["progress"] = clamp_growth_progress(payload.get("progress"))
    if "status" in payload:
        updated["status"] = "completed" if str(payload.get("status", "")).strip().lower() == "completed" else "in_progress"

    if updated.get("status") == "completed" and "progress" not in updated:
        updated["progress"] = 100
    if updated.get("progress", -1) >= 100:
        updated["status"] = "completed"

    return updated


def sanitize_growth_change_request_payload(payload: dict):
    return {
        **sanitize_growth_project_update_payload(payload),
        "requestNote": str(payload.get("requestNote", "")).strip(),
    }


def get_growth_avatar_fallback(name: str = ""):
    clean_name = str(name or "").strip()
    return clean_name[:2] if clean_name else "客户"


def build_growth_avatar_svg(name: str = ""):
    text = get_growth_avatar_fallback(name)
    svg = f"""
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f97316" />
          <stop offset="100%" stop-color="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="28" fill="url(#g)" />
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="30" fill="#ffffff">{text}</text>
    </svg>
    """.strip()
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def build_growth_level(completed_count: int = 0):
    tiers = [
        {"key": "bronze", "title": "青铜", "icon": "◆", "minCompletedTasks": 0, "color": "#b87333", "accentColor": "#7c4a1d", "glowColor": "rgba(184, 115, 51, 0.28)"},
        {"key": "silver", "title": "白银", "icon": "◇", "minCompletedTasks": 2, "color": "#c0c7d1", "accentColor": "#5b6470", "glowColor": "rgba(192, 199, 209, 0.32)"},
        {"key": "gold", "title": "黄金", "icon": "★", "minCompletedTasks": 5, "color": "#f4c542", "accentColor": "#8a5b00", "glowColor": "rgba(244, 197, 66, 0.3)"},
        {"key": "platinum", "title": "铂金", "icon": "✦", "minCompletedTasks": 20, "color": "#74d2c9", "accentColor": "#0f5f67", "glowColor": "rgba(116, 210, 201, 0.3)"},
    ]
    total = max(0, int(completed_count or 0))
    current = tiers[0]
    for tier in tiers:
        if total >= tier["minCompletedTasks"]:
            current = tier
        else:
            break
    current_index = next((index for index, item in enumerate(tiers) if item["key"] == current["key"]), 0)
    next_tier = tiers[current_index + 1] if current_index + 1 < len(tiers) else None
    return {
        **current,
        "frameName": f"{current['title']}头像框",
        "nextLevel": {
            "key": next_tier["key"],
            "title": next_tier["title"],
            "minCompletedTasks": next_tier["minCompletedTasks"],
            "remainingTasks": max(0, next_tier["minCompletedTasks"] - total),
        } if next_tier else None,
    }


def normalize_growth_change_request(request: dict | None = None):
    current = request or {}
    requested_changes = current.get("requestedChanges", {})
    if not isinstance(requested_changes, dict):
        requested_changes = {}
    current_snapshot = current.get("currentSnapshot")

    return {
        "id": str(current.get("id", "")).strip(),
        "status": str(current.get("status", "pending")).strip().lower() or "pending",
        "requestNote": str(current.get("requestNote", "")).strip(),
        "replyMessage": str(current.get("replyMessage", "")).strip(),
        "submittedAt": str(current.get("submittedAt", "")).strip(),
        "reviewedAt": str(current.get("reviewedAt", "")).strip(),
        "requestedChanges": sanitize_growth_project_update_payload(requested_changes),
        "currentSnapshot": normalize_growth_project({**current_snapshot, "changeRequests": []}) if isinstance(current_snapshot, dict) else None,
    }


def normalize_growth_project(project: dict | None = None):
    current = project or {}
    progress = clamp_growth_progress(current.get("progress", 0))
    status = "completed" if str(current.get("status", "")).strip().lower() == "completed" or progress >= 100 else "in_progress"
    change_requests = current.get("changeRequests", [])
    if not isinstance(change_requests, list):
        change_requests = []
    normalized_requests = [normalize_growth_change_request(item) for item in change_requests]
    normalized_requests.sort(key=lambda item: (0 if item["status"] == "pending" else 1, str(item.get("submittedAt", ""))), reverse=False)
    normalized_requests.sort(key=lambda item: 0 if item["status"] == "pending" else 1)

    return {
        "id": str(current.get("id", "")).strip(),
        "loanProject": str(current.get("loanProject", "")).strip(),
        "amount": str(current.get("amount", "")).strip(),
        "details": str(current.get("details", "")).strip(),
        "progress": progress,
        "status": status,
        "createdAt": str(current.get("createdAt", "")).strip(),
        "updatedAt": str(current.get("updatedAt", "")).strip(),
        "changeRequests": normalized_requests,
        "pendingChangeCount": sum(1 for item in normalized_requests if item["status"] == "pending"),
    }


def normalize_growth_customer(customer: dict | None = None):
    current = customer or {}
    projects = current.get("projects", [])
    if not isinstance(projects, list):
        projects = []
    normalized_projects = [normalize_growth_project(item) for item in projects]
    completed_count = sum(1 for item in normalized_projects if item["status"] == "completed")
    pending_change_count = sum(int(item.get("pendingChangeCount", 0) or 0) for item in normalized_projects)
    notifications = []
    for project in normalized_projects:
        for request in project.get("changeRequests", []):
            if request["status"] in {"approved", "rejected"}:
                notifications.append({
                    "id": request["id"],
                    "projectId": project["id"],
                    "projectName": project["loanProject"],
                    "status": request["status"],
                    "replyMessage": request["replyMessage"],
                    "reviewedAt": request["reviewedAt"],
                    "submittedAt": request["submittedAt"],
                })
    notifications.sort(key=lambda item: str(item.get("reviewedAt") or item.get("submittedAt") or ""), reverse=True)
    avatar_url = str(current.get("avatarUrl", "")).strip() or build_growth_avatar_svg(current.get("customerName", ""))

    return {
        "id": str(current.get("id", "")).strip(),
        "customerName": str(current.get("customerName", "")).strip(),
        "avatarUrl": avatar_url,
        "avatarFallback": get_growth_avatar_fallback(current.get("customerName", "")),
        "createdAt": str(current.get("createdAt", "")).strip(),
        "updatedAt": str(current.get("updatedAt", "")).strip(),
        "projects": normalized_projects,
        "activeProjects": [item for item in normalized_projects if item["status"] != "completed"],
        "completedCount": completed_count,
        "growthLevel": build_growth_level(completed_count),
        "totalProjects": len(normalized_projects),
        "pendingChangeCount": pending_change_count,
        "reviewNotifications": notifications[:20],
    }


def get_growth_customers(data: dict):
    customers = data.get("growthCustomers", [])
    if not isinstance(customers, list):
        customers = []
    normalized = [normalize_growth_customer(item) for item in customers]
    normalized.sort(key=lambda item: str(item.get("updatedAt") or item.get("createdAt") or ""), reverse=True)
    return normalized


def find_growth_customer_index(data: dict, customer_id: str):
    for index, item in enumerate(data.get("growthCustomers", [])):
        if str(item.get("id", "")).strip() == str(customer_id or "").strip():
            return index
    return -1


def find_growth_project(data: dict, project_id: str):
    target = str(project_id or "").strip()
    for customer_index, customer in enumerate(data.get("growthCustomers", [])):
        projects = customer.get("projects", [])
        if not isinstance(projects, list):
            continue
        for project_index, project in enumerate(projects):
            if str(project.get("id", "")).strip() == target:
                return {
                    "customerIndex": customer_index,
                    "projectIndex": project_index,
                    "customer": customer,
                    "project": project,
                }
    return None


def find_growth_change_request(data: dict, request_id: str):
    target = str(request_id or "").strip()
    for customer_index, customer in enumerate(data.get("growthCustomers", [])):
        projects = customer.get("projects", [])
        if not isinstance(projects, list):
            continue
        for project_index, project in enumerate(projects):
            change_requests = project.get("changeRequests", [])
            if not isinstance(change_requests, list):
                continue
            for request_index, request in enumerate(change_requests):
                if str(request.get("id", "")).strip() == target:
                    return {
                        "customerIndex": customer_index,
                        "projectIndex": project_index,
                        "requestIndex": request_index,
                        "customer": customer,
                        "project": project,
                        "request": request,
                    }
    return None


class AppHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.handle_get(include_body=True)

    def do_HEAD(self):
        self.handle_get(include_body=False)

    def handle_get(self, include_body: bool = True):
        parsed = urlparse(self.path)
        route = unquote(parsed.path)
        respond_json = lambda status, payload: json_response(self, status, payload, include_body=include_body)
        respond_file = lambda file_path: send_file(self, file_path, include_body=include_body)

        if route == "/site-meta.js":
            body = f"window.SITE_META = {json.dumps(SITE_META, ensure_ascii=False, indent=2)};\n".encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if include_body:
                self.wfile.write(body)
            return

        if route == "/api/health":
            data = read_data()
            analytics = read_analytics()
            return respond_json(
                200,
                {
                    "ok": True,
                    "runtime": "python",
                    "host": HOST,
                    "port": PORT,
                    "now": datetime.now(tz=timezone.utc).isoformat(),
                    "data": {
                        "contentCount": len(data["contents"]),
                        "noteCount": len(data["notes"]),
                        "growthCustomerCount": len(data.get("growthCustomers", [])),
                        "userProfileCount": len(data.get("userProfiles", {})),
                        "vipUserCount": len(data.get("vipUsers", {})),
                        "analyticsUserCount": len(analytics.get("users", {})),
                        "analyticsEventCount": len(analytics.get("events", [])),
                    },
                },
            )

        if route == "/api/share-debug":
            debug_data = read_share_debug()
            events = debug_data.get("events", []) if isinstance(debug_data.get("events"), list) else []
            return respond_json(200, {"events": list(reversed(events[-20:]))})

        if route == "/api/config":
            data = read_data()
            return respond_json(
                200,
                {
                    "sections": data["sections"],
                    "rechargePlans": list(get_plan_catalog().values()),
                },
            )

        if route == "/api/recharge/plans":
            return respond_json(200, {"plans": list(get_plan_catalog().values())})

        if route.startswith("/api/users/state/"):
            user_id = route.replace("/api/users/state/", "", 1).strip()
            if not user_id:
                return respond_json(400, {"message": "userId required"})
            data = read_data()
            return respond_json(200, build_user_state(data, user_id))

        if route.startswith("/api/users/profile/"):
            user_id = route.replace("/api/users/profile/", "", 1).strip()
            if not user_id:
                return respond_json(400, {"message": "userId required"})

            data = read_data()
            profile = get_user_profile(data, user_id)
            if not profile:
                return respond_json(404, {"message": "user profile not found"})

            return respond_json(200, {"profile": profile})

        if route == "/api/users/vip":
            return respond_json(200, {"users": get_all_vip_user_summaries()})

        if route.startswith("/api/users/vip/"):
            user_id = route.replace("/api/users/vip/", "", 1).strip()
            if not user_id:
                return respond_json(400, {"message": "userId required"})

            data = read_data()
            return respond_json(
                200,
                {
                    "user": build_vip_user_summary(
                        data,
                        user_id,
                        data.get("vipUsers", {}).get(user_id, {}),
                    )
                },
            )

        if route == "/api/content":
            data = read_data()
            query = parse_qs(parsed.query)
            page = str(query.get("page", [""])[0]).strip()
            group_key = str(query.get("groupKey", [""])[0]).strip()
            sub_key = str(query.get("subKey", [""])[0]).strip()

            contents = data["contents"]
            if page:
                contents = [item for item in contents if item["page"] == page]
            if group_key:
                contents = [item for item in contents if item["groupKey"] == group_key]
            if sub_key:
                contents = [item for item in contents if item["subKey"] == sub_key]

            return respond_json(200, {"contents": [enrich_content_item(item) for item in contents]})

        if route == "/api/notes":
            data = read_data()
            query = parse_qs(parsed.query)
            category = str(query.get("category", [""])[0]).strip()
            keyword = str(query.get("keyword", [""])[0]).strip().lower()

            notes = list(data["notes"])
            if category:
                notes = [item for item in notes if item.get("category", "") == category]
            if keyword:
                notes = [
                    item
                    for item in notes
                    if keyword in str(item.get("title", "")).lower()
                    or keyword in str(item.get("body", "")).lower()
                ]

            notes.sort(
                key=lambda item: (
                    int(bool(item.get("pinned", False))),
                    str(item.get("updatedAt") or item.get("createdAt") or ""),
                ),
                reverse=True,
            )
            return respond_json(200, {"notes": notes})

        if route == "/api/growth/customers":
            data = read_data()
            return respond_json(200, {"customers": get_growth_customers(data)})

        if route.startswith("/api/growth/customers/"):
            customer_id = route.replace("/api/growth/customers/", "", 1).strip()
            if customer_id and "/" not in customer_id:
                customer = next((item for item in get_growth_customers(read_data()) if item["id"] == customer_id), None)
                if not customer:
                    return respond_json(404, {"message": "customer not found"})
                return respond_json(200, {"customer": customer})

        if route == "/api/wechat/signature":
            if not WECHAT_APP_ID or not WECHAT_APP_SECRET:
                return respond_json(
                    503,
                    {
                        "message": "wechat not configured",
                        "configured": False,
                    },
                )

            query = parse_qs(parsed.query)
            target_url = str(query.get("url", [""])[0]).strip()
            if not target_url:
                return respond_json(400, {"message": "url query parameter is required"})

            try:
                return respond_json(200, build_wechat_signature(target_url))
            except (HTTPError, URLError, TimeoutError, RuntimeError) as error:
                return respond_json(502, {"message": str(error)})
            except Exception:
                return respond_json(500, {"message": "wechat signature failed"})

        if route == "/api/wechat/oauth/session":
            return respond_json(
                200,
                {
                    "configured": bool(WECHAT_APP_ID and WECHAT_APP_SECRET),
                    "inWechat": is_wechat_browser_request(self),
                    "hasOpenId": bool(get_wechat_openid_from_request(self)),
                },
            )

        if route == "/api/wechat/oauth/start":
            if not WECHAT_APP_ID or not WECHAT_APP_SECRET:
                return respond_json(503, {"message": "wechat oauth not configured", "configured": False})

            query = parse_qs(parsed.query)
            try:
                redirect_url = sanitize_wechat_redirect_url(self, str(query.get("redirect", [""])[0]).strip())
            except RuntimeError as error:
                return respond_json(400, {"message": str(error)})

            state = secrets.token_hex(8)
            callback_url = f"{get_request_origin(self)}/api/wechat/oauth/callback?redirect={quote(redirect_url, safe='')}"
            authorize_url = (
                "https://open.weixin.qq.com/connect/oauth2/authorize"
                f"?appid={quote(WECHAT_APP_ID)}"
                f"&redirect_uri={quote(callback_url, safe='')}"
                "&response_type=code"
                "&scope=snsapi_base"
                f"&state={quote(state)}"
                "#wechat_redirect"
            )

            self.send_response(302)
            self.send_header("Location", authorize_url)
            self.send_header("Set-Cookie", f"wechat_oauth_state={state}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax")
            self.end_headers()
            return

        if route == "/api/wechat/oauth/callback":
            query = parse_qs(parsed.query)
            code = str(query.get("code", [""])[0]).strip()
            state = str(query.get("state", [""])[0]).strip()
            redirect_url = str(query.get("redirect", [""])[0]).strip()
            cookie_state = str(parse_request_cookies(self).get("wechat_oauth_state", "")).strip()

            if not code:
                return send_html(self, "wechat oauth code missing", 400)
            if not state or not cookie_state or state != cookie_state:
                return send_html(self, "wechat oauth state mismatch", 400)

            try:
                clean_redirect_url = sanitize_wechat_redirect_url(self, redirect_url)
                openid = get_wechat_oauth_openid(code)
            except Exception as error:
                return send_html(self, escape(str(error)), 502)

            target = urlparse(clean_redirect_url)
            current_query = parse_qs(target.query)
            current_query["wechatAuth"] = ["1"]
            final_query = urlencode([(key, item) for key, values in current_query.items() for item in values])
            final_url = target._replace(query=final_query).geturl()

            self.send_response(302)
            self.send_header("Location", final_url)
            self.send_header("Set-Cookie", "wechat_oauth_state=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax")
            self.send_header("Set-Cookie", f"wechat_openid={openid}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax")
            self.end_headers()
            return

        if route.startswith("/api/recharge/orders/") and route.endswith("/status"):
            order_id = route.replace("/api/recharge/orders/", "", 1).rsplit("/status", 1)[0].strip()
            if not order_id:
                return respond_json(400, {"message": "orderId required"})

            data = read_data()
            order_index = find_recharge_order_index(data, order_id)
            if order_index < 0:
                return respond_json(404, {"message": "order not found"})

            order = normalize_recharge_order(data["rechargeOrders"][order_index])
            if order["paymentMethod"] == "wechat" and is_wechat_pay_configured() and order["paymentStatus"] != "paid":
                try:
                    query_result = query_wechat_transaction(order["id"])
                    order = apply_recharge_order_state(data, order_index, query_result)
                    write_data(data)
                except Exception as error:
                    return respond_json(502, {"message": str(error), "order": order})

            return respond_json(
                200,
                {
                    "order": order,
                    "vip": build_vip_user_summary(data, order["userId"], data.get("vipUsers", {}).get(order["userId"], {})),
                },
            )

        if route.startswith("/api/content/"):
            slug = route.replace("/api/content/", "", 1)
            data = read_data()
            content = next((item for item in data["contents"] if item["slug"] == slug), None)
            if not content:
                return respond_json(404, {"message": "content not found"})

            meta = resolve_meta(data, content["page"], content["groupKey"], content["subKey"]) or {}
            return respond_json(200, {"content": {**enrich_content_item(content), **meta}})

        if route == "/api/analytics":
            query = parse_qs(parsed.query)
            user_id = str(query.get("userId", [""])[0]).strip()
            return respond_json(200, build_analytics_response(user_id))

        if route.startswith("/content/"):
            slug = route.replace("/content/", "", 1).strip()
            data = read_data()
            content = next((item for item in data["contents"] if item.get("slug") == slug), None)
            if not content:
                return send_file(self, PUBLIC_DIR / "detail.html")
            return send_html(self, render_detail_html(self, content))

        if route.startswith("/section/"):
            return respond_file(PUBLIC_DIR / "subsection.html")

        if route == "/":
            return respond_file(PUBLIC_DIR / "index.html")

        safe_path = route.lstrip("/") or "index.html"
        target = (PUBLIC_DIR / safe_path).resolve()
        if PUBLIC_DIR.resolve() not in target.parents and target != PUBLIC_DIR.resolve():
            return self.send_error(403, "Forbidden")
        return respond_file(target)

    def do_POST(self):
        parsed = urlparse(self.path)
        payload = parse_json_body(self)
        if payload is None:
            return json_response(self, 400, {"message": "invalid JSON body"})

        if parsed.path == "/api/uploads/image":
            try:
                upload = save_uploaded_image(payload)
            except ValueError as error:
                return json_response(self, 400, {"message": str(error)})

            return json_response(self, 201, {"message": "uploaded", "file": upload})

        if parsed.path == "/api/share-debug":
            debug_data = read_share_debug()
            events = debug_data.get("events", []) if isinstance(debug_data.get("events"), list) else []
            events.append(
                {
                    "id": f"share-debug-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}",
                    "createdAt": datetime.now(tz=timezone.utc).isoformat(),
                    "path": str(payload.get("path", "")).strip(),
                    "userAgent": str(payload.get("userAgent", "")).strip(),
                    "lines": [str(item or "") for item in payload.get("lines", [])] if isinstance(payload.get("lines"), list) else [],
                }
            )
            debug_data["events"] = events[-100:]
            write_share_debug(debug_data)
            return json_response(self, 201, {"message": "recorded"})

        if parsed.path == "/api/users/register":
            profile_payload = sanitize_user_profile_payload(payload)
            validation_message = validate_user_profile_payload(profile_payload)
            if validation_message:
                return json_response(self, 400, {"message": validation_message})

            data = read_data()
            analytics = read_analytics()
            if is_reserved_user_id(data, analytics, profile_payload["previousUserId"], profile_payload["userId"]):
                return json_response(self, 409, {"message": "userId already exists"})

            migrate_user_identity(data, analytics, profile_payload["previousUserId"], profile_payload["userId"])

            now = datetime.now(tz=timezone.utc).isoformat()
            current = get_user_profile(data, profile_payload["userId"])
            profile = normalize_user_profile_record(
                profile_payload["userId"],
                {
                    **(current or {}),
                    **profile_payload,
                    "userId": profile_payload["userId"],
                    "createdAt": current["createdAt"] if current else now,
                    "updatedAt": now,
                },
            )

            data.setdefault("userProfiles", {})[profile_payload["userId"]] = profile
            write_data(data)
            write_analytics(analytics)

            return json_response(self, 201, {"message": "user registered", "profile": profile})

        if parsed.path == "/api/content":
            item = sanitize_content_payload(payload)
            if not item["page"] or not item["groupKey"] or not item["subKey"] or not item["title"]:
                return json_response(self, 400, {"message": "page/groupKey/subKey/title required"})

            data = read_data()
            meta = resolve_meta(data, item["page"], item["groupKey"], item["subKey"])
            if not meta:
                return json_response(self, 400, {"message": "page/groupKey/subKey invalid"})

            content = {
                "id": f"content-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}",
                **item,
                "slug": build_unique_slug(data, item),
                "createdAt": datetime.now(tz=timezone.utc).isoformat(),
            }

            data["contents"].insert(0, content)
            write_data(data)

            return json_response(
                self,
                201,
                {
                    "message": "created",
                    "content": {
                        **enrich_content_item(content),
                        **meta,
                    },
                },
            )

        if parsed.path == "/api/notes":
            item = sanitize_note_payload(payload)
            if not item["title"] or not item["body"]:
                return json_response(self, 400, {"message": "title/body required"})

            now = datetime.now(tz=timezone.utc).isoformat()
            note = {
                "id": f"note-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}",
                **item,
                "createdAt": now,
                "updatedAt": now,
            }

            data = read_data()
            data["notes"].insert(0, note)
            write_data(data)

            return json_response(self, 201, {"message": "created", "note": note})

        if parsed.path == "/api/growth/customers":
            growth_payload = sanitize_growth_customer_create_payload(payload)
            project = growth_payload["project"]
            if not growth_payload["customerName"] or not project["loanProject"] or not project["amount"] or not project["details"]:
                return json_response(self, 400, {"message": "customerName/loanProject/amount/details required"})

            now = datetime.now(tz=timezone.utc).isoformat()
            timestamp = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
            customer = {
                "id": f"growth-user-{timestamp}",
                "customerName": growth_payload["customerName"],
                "avatarUrl": growth_payload["avatarUrl"] or build_growth_avatar_svg(growth_payload["customerName"]),
                "createdAt": now,
                "updatedAt": now,
                "projects": [
                    {
                        "id": f"growth-project-{timestamp}",
                        **project,
                        "changeRequests": [],
                        "createdAt": now,
                        "updatedAt": now,
                    }
                ],
            }

            data = read_data()
            data.setdefault("growthCustomers", []).insert(0, customer)
            write_data(data)

            return json_response(self, 201, {"message": "growth customer created", "customer": normalize_growth_customer(customer)})

        if parsed.path == "/api/analytics/track":
            tracking_payload = sanitize_tracking_payload(payload)
            if (
                not tracking_payload["userId"]
                or not tracking_payload["page"]
                or not tracking_payload["groupKey"]
                or not tracking_payload["subKey"]
            ):
                return json_response(self, 400, {"message": "userId/page/groupKey/subKey required"})

            result = record_tracking_event(tracking_payload)
            if result.get("error"):
                return json_response(self, 400, {"message": result["error"]})

            return json_response(self, 201, {"message": "tracked", "event": result["event"]})

        if parsed.path == "/api/users/vip/grant":
            grant_payload = sanitize_vip_grant_payload(payload)
            if not grant_payload["userId"]:
                return json_response(self, 400, {"message": "userId required"})
            if grant_payload["days"] <= 0:
                return json_response(self, 400, {"message": "days must be greater than 0"})

            data = read_data()
            record = normalize_vip_user_record(
                grant_payload["userId"],
                data.get("vipUsers", {}).get(grant_payload["userId"], {}),
            )
            updated = add_vip_duration(
                record,
                grant_payload["days"],
                admin_grant=True,
                notes=grant_payload["notes"],
            )
            data.setdefault("vipUsers", {})[grant_payload["userId"]] = updated
            write_data(data)

            return json_response(
                self,
                201,
                {
                    "message": "vip granted",
                    "user": build_vip_user_summary(data, grant_payload["userId"], updated),
                },
            )

        if parsed.path == "/api/recharge/orders":
            order_payload = sanitize_recharge_order_payload(payload)
            plans = get_plan_catalog()
            plan = plans.get(order_payload["planKey"])

            if not order_payload["userId"] or not order_payload["planKey"] or not order_payload["paymentMethod"]:
                return json_response(self, 400, {"message": "userId/planKey/paymentMethod required"})

            if not plan:
                return json_response(self, 400, {"message": "planKey invalid"})

            if order_payload["paymentMethod"] not in {"wechat", "alipay"}:
                return json_response(self, 400, {"message": "paymentMethod invalid"})

            now = datetime.now(tz=timezone.utc).isoformat()
            order = {
                "id": f"recharge-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}",
                "userId": order_payload["userId"],
                "planKey": plan["key"],
                "planLabel": plan["label"],
                "amount": plan["price"],
                "durationDays": plan["durationDays"],
                "paymentMethod": order_payload["paymentMethod"],
                "paymentChannel": "h5",
                "status": "pending",
                "paymentStatus": "awaiting_integration",
                "gateway": "wechat_pay" if order_payload["paymentMethod"] == "wechat" else "alipay",
                "gatewayMessage": "?????????" if order_payload["paymentMethod"] == "wechat" else "??????????",
                "gatewayTransactionId": "",
                "wechatH5Url": "",
                "tradeState": "",
                "tradeStateDesc": "",
                "paidAt": "",
                "createdAt": now,
                "updatedAt": now,
            }

            if order_payload["paymentMethod"] == "wechat":
                if not is_wechat_pay_configured():
                    missing = []
                    if not WECHAT_PAY_APP_ID:
                        missing.append("WECHAT_PAY_APP_ID")
                    if not WECHAT_PAY_MCH_ID:
                        missing.append("WECHAT_PAY_MCH_ID")
                    if not WECHAT_PAY_SERIAL_NO:
                        missing.append("WECHAT_PAY_SERIAL_NO")
                    if not WECHAT_PAY_PRIVATE_KEY:
                        missing.append("WECHAT_PAY_PRIVATE_KEY / WECHAT_PAY_PRIVATE_KEY_PATH")
                    if hashes is None or serialization is None or padding is None:
                        missing.append("cryptography")
                    return json_response(self, 503, {"message": "wechat pay not configured", "missing": missing})

                try:
                    gateway_result = create_wechat_h5_transaction(self, order)
                    h5_url = str(gateway_result.get("h5_url", "")).strip()
                    if not h5_url:
                        raise RuntimeError("wechat pay response missing h5_url")
                    order["paymentStatus"] = "awaiting_payment"
                    order["gatewayMessage"] = "?????????????????"
                    order["wechatH5Url"] = h5_url
                    order["tradeState"] = "NOTPAY"
                    order["tradeStateDesc"] = "???"
                except Exception as error:
                    return json_response(self, 502, {"message": str(error)})

            data = read_data()
            data.setdefault("rechargeOrders", []).insert(0, order)
            write_data(data)

            return json_response(
                self,
                201,
                {
                    "message": "order created",
                    "order": normalize_recharge_order(order),
                    "integrationReady": order_payload["paymentMethod"] == "wechat",
                    "payment": (
                        {
                            "mode": "redirect",
                            "h5Url": order["wechatH5Url"],
                        }
                        if order_payload["paymentMethod"] == "wechat"
                        else None
                    ),
                    "nextStep": (
                        "????????????????????????????"
                        if order_payload["paymentMethod"] == "wechat"
                        else "?????????????????????"
                    ),
                },
            )

        if parsed.path == "/api/wechat/pay/notify":
            return json_response(self, 200, {"code": "SUCCESS", "message": "OK"})

        if parsed.path.startswith("/api/growth/customers/") and parsed.path.endswith("/projects"):
            customer_id = parsed.path.replace("/api/growth/customers/", "", 1).rsplit("/projects", 1)[0].strip()
            project_payload = sanitize_growth_project_payload(payload)
            if not project_payload["loanProject"] or not project_payload["amount"] or not project_payload["details"]:
                return json_response(self, 400, {"message": "loanProject/amount/details required"})

            data = read_data()
            customer_index = find_growth_customer_index(data, customer_id)
            if customer_index < 0:
                return json_response(self, 404, {"message": "customer not found"})

            now = datetime.now(tz=timezone.utc).isoformat()
            project = {
                "id": f"growth-project-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}",
                **project_payload,
                "changeRequests": [],
                "createdAt": now,
                "updatedAt": now,
            }
            data["growthCustomers"][customer_index].setdefault("projects", []).insert(0, project)
            data["growthCustomers"][customer_index]["updatedAt"] = now
            write_data(data)

            return json_response(
                self,
                201,
                {
                    "message": "growth project created",
                    "customer": normalize_growth_customer(data["growthCustomers"][customer_index]),
                    "project": normalize_growth_project(project),
                },
            )

        if parsed.path.startswith("/api/growth/projects/") and parsed.path.endswith("/change-requests"):
            project_id = parsed.path.replace("/api/growth/projects/", "", 1).rsplit("/change-requests", 1)[0].strip()
            request_payload = sanitize_growth_change_request_payload(payload)
            requested_changes = {
                key: value
                for key, value in request_payload.items()
                if key != "requestNote" and value not in ("", None)
            }
            if not requested_changes and not request_payload["requestNote"]:
                return json_response(self, 400, {"message": "no changes submitted"})

            data = read_data()
            found = find_growth_project(data, project_id)
            if not found:
                return json_response(self, 404, {"message": "project not found"})

            change_requests = found["project"].setdefault("changeRequests", [])
            if any(str(item.get("status", "")).strip().lower() == "pending" for item in change_requests):
                return json_response(self, 400, {"message": "pending change request already exists"})

            now = datetime.now(tz=timezone.utc).isoformat()
            request = {
                "id": f"growth-request-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}",
                "status": "pending",
                "requestNote": request_payload["requestNote"],
                "replyMessage": "",
                "submittedAt": now,
                "reviewedAt": "",
                "requestedChanges": requested_changes,
                "currentSnapshot": {
                    "id": found["project"].get("id", ""),
                    "loanProject": found["project"].get("loanProject", ""),
                    "amount": found["project"].get("amount", ""),
                    "details": found["project"].get("details", ""),
                    "progress": found["project"].get("progress", 0),
                    "status": found["project"].get("status", "in_progress"),
                    "createdAt": found["project"].get("createdAt", ""),
                    "updatedAt": found["project"].get("updatedAt", ""),
                },
            }
            change_requests.insert(0, request)
            data["growthCustomers"][found["customerIndex"]]["updatedAt"] = now
            write_data(data)

            return json_response(
                self,
                201,
                {
                    "message": "growth change request created",
                    "customer": normalize_growth_customer(data["growthCustomers"][found["customerIndex"]]),
                    "project": normalize_growth_project(data["growthCustomers"][found["customerIndex"]]["projects"][found["projectIndex"]]),
                    "request": normalize_growth_change_request(request),
                },
            )

        if parsed.path.startswith("/api/growth/change-requests/") and (parsed.path.endswith("/approve") or parsed.path.endswith("/reject")):
            action = "approve" if parsed.path.endswith("/approve") else "reject"
            request_id = parsed.path.replace("/api/growth/change-requests/", "", 1).rsplit(f"/{action}", 1)[0].strip()
            reply_message = str(payload.get("replyMessage", "")).strip()

            data = read_data()
            found = find_growth_change_request(data, request_id)
            if not found:
                return json_response(self, 404, {"message": "change request not found"})

            current_request = found["request"]
            if str(current_request.get("status", "")).strip().lower() != "pending":
                return json_response(self, 400, {"message": "change request already reviewed"})

            now = datetime.now(tz=timezone.utc).isoformat()
            if action == "approve":
                project = data["growthCustomers"][found["customerIndex"]]["projects"][found["projectIndex"]]
                project.update({
                    **project,
                    **sanitize_growth_project_update_payload(current_request.get("requestedChanges", {})),
                    "updatedAt": now,
                })
                current_request["status"] = "approved"
            else:
                current_request["status"] = "rejected"

            current_request["replyMessage"] = reply_message
            current_request["reviewedAt"] = now
            data["growthCustomers"][found["customerIndex"]]["updatedAt"] = now
            write_data(data)

            return json_response(
                self,
                200,
                {
                    "message": f"growth change request {action}d",
                    "customer": normalize_growth_customer(data["growthCustomers"][found["customerIndex"]]),
                    "project": normalize_growth_project(data["growthCustomers"][found["customerIndex"]]["projects"][found["projectIndex"]]),
                    "request": normalize_growth_change_request(data["growthCustomers"][found["customerIndex"]]["projects"][found["projectIndex"]]["changeRequests"][found["requestIndex"]]),
                },
            )

        return self.send_error(404, "Not Found")

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/notes/"):
            note_id = parsed.path.replace("/api/notes/", "", 1)
            payload = parse_json_body(self)
            if payload is None:
                return json_response(self, 400, {"message": "invalid JSON body"})

            data = read_data()
            index = next((idx for idx, item in enumerate(data["notes"]) if item["id"] == note_id), -1)
            if index < 0:
                return json_response(self, 404, {"message": "note not found"})

            updated = sanitize_note_payload(payload)
            if not updated["title"] or not updated["body"]:
                return json_response(self, 400, {"message": "title/body required"})

            merged = {
                **data["notes"][index],
                **updated,
                "updatedAt": datetime.now(tz=timezone.utc).isoformat(),
            }
            data["notes"][index] = merged
            write_data(data)
            return json_response(self, 200, {"message": "updated", "note": merged})

        if not parsed.path.startswith("/api/content/"):
            return self.send_error(404, "Not Found")

        content_id = parsed.path.replace("/api/content/", "", 1)
        payload = parse_json_body(self)
        if payload is None:
            return json_response(self, 400, {"message": "invalid JSON body"})

        data = read_data()
        index = next((idx for idx, item in enumerate(data["contents"]) if item["id"] == content_id), -1)
        if index < 0:
            return json_response(self, 404, {"message": "content not found"})

        updated = sanitize_content_payload(payload)
        if not updated["page"] or not updated["groupKey"] or not updated["subKey"] or not updated["title"]:
            return json_response(self, 400, {"message": "page/groupKey/subKey/title required"})

        meta = resolve_meta(data, updated["page"], updated["groupKey"], updated["subKey"])
        if not meta:
            return json_response(self, 400, {"message": "page/groupKey/subKey invalid"})

        original = data["contents"][index]
        # Keep slug stable unless title/subsection changed and conflict-safe regeneration is needed.
        should_refresh_slug = (
            original["title"] != updated["title"]
            or original["page"] != updated["page"]
            or original["groupKey"] != updated["groupKey"]
            or original["subKey"] != updated["subKey"]
        )
        slug = original["slug"]
        if should_refresh_slug:
            slug = build_unique_slug(data, updated, ignore_id=original["id"])

        merged = {
            **original,
            **updated,
            "slug": slug,
            "updatedAt": datetime.now(tz=timezone.utc).isoformat(),
        }
        data["contents"][index] = merged
        write_data(data)

        return json_response(
            self,
            200,
            {
                "message": "updated",
                "content": {
                    **enrich_content_item(merged),
                    **meta,
                },
            },
        )

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/analytics":
            write_analytics({"users": {}, "events": []})
            return json_response(self, 200, {"message": "analytics cleared"})

        if parsed.path == "/api/share-debug":
            write_share_debug({"events": []})
            return json_response(self, 200, {"message": "cleared"})

        if parsed.path.startswith("/api/analytics/users/"):
            user_id = parsed.path.replace("/api/analytics/users/", "", 1).strip()
            if not user_id:
                return json_response(self, 400, {"message": "userId required"})

            analytics = read_analytics()
            if user_id not in analytics.get("users", {}):
                return json_response(self, 404, {"message": "user not found"})

            analytics["users"].pop(user_id, None)
            analytics["events"] = [item for item in analytics.get("events", []) if item.get("userId") != user_id]
            write_analytics(analytics)
            return json_response(self, 200, {"message": "user analytics deleted", "userId": user_id})

        if parsed.path.startswith("/api/notes/"):
            note_id = parsed.path.replace("/api/notes/", "", 1)
            data = read_data()
            before = len(data["notes"])
            data["notes"] = [item for item in data["notes"] if item["id"] != note_id]

            if len(data["notes"]) == before:
                return json_response(self, 404, {"message": "note not found"})

            write_data(data)
            return json_response(self, 200, {"message": "deleted", "id": note_id})

        if not parsed.path.startswith("/api/content/"):
            return self.send_error(404, "Not Found")

        content_id = parsed.path.replace("/api/content/", "", 1)
        data = read_data()
        before = len(data["contents"])
        data["contents"] = [item for item in data["contents"] if item["id"] != content_id]

        if len(data["contents"]) == before:
            return json_response(self, 404, {"message": "content not found"})

        write_data(data)
        return json_response(self, 200, {"message": "deleted", "id": content_id})

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    ensure_data_files()
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print(f"Server is running at http://{HOST}:{PORT}")
    server.serve_forever()
