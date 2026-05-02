from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
import json
import mimetypes
import os
import socket
import uuid
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
DATA_DIR = ROOT / "data"
ORDERS_FILE = DATA_DIR / "orders.json"
MENU_CONFIG_FILE = DATA_DIR / "menu_config.json"
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "3000"))
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "coffeeadmin")
STANDARD_SIZES = ["Standard", "Small", "Large"]
ESPRESSO_SIZES = ["Single", "Double"]
STANDARD_MILKS = ["None", "Whole", "2%", "Skim", "Almond", "Oat"]
CREAMERS = ["Plain", "Vanilla", "Hazelnut", "Caramel", "Sweet cream"]
MILK_REQUIRED_DRINKS = {"latte", "mocha"}
DEFAULT_SYRUPS = [
    "Vanilla",
    "Caramel",
    "Hazelnut",
    "Mocha",
    "Lavender",
    "Peppermint",
]
OPTION_ALIASES = {
    "milk": {
        "Whole milk": "Whole",
        "Skim milk": "Skim",
        "Oat milk": "Oat",
        "Almond milk": "Almond",
    }
}

MENU = [
    {
        "id": "espresso",
        "name": "Espresso",
        "description": "Short, bold, no nonsense.",
        "options": {
            "size": ESPRESSO_SIZES,
            "milk": STANDARD_MILKS,
            "creamer": CREAMERS,
            "syrups": DEFAULT_SYRUPS,
            "sweetness": ["Unsweetened", "Light", "Sweet"],
        },
    },
    {
        "id": "americano",
        "name": "Americano",
        "description": "Espresso stretched with hot water.",
        "options": {
            "size": STANDARD_SIZES,
            "milk": STANDARD_MILKS,
            "creamer": CREAMERS,
            "syrups": DEFAULT_SYRUPS,
            "sweetness": ["Unsweetened", "Light", "Sweet"],
        },
    },
    {
        "id": "latte",
        "name": "Latte",
        "description": "Velvety milk, gentle espresso.",
        "options": {
            "size": STANDARD_SIZES,
            "milk": STANDARD_MILKS,
            "creamer": CREAMERS,
            "syrups": DEFAULT_SYRUPS,
            "sweetness": ["Unsweetened", "Light", "Sweet"],
        },
    },
    {
        "id": "cappuccino",
        "name": "Cappuccino",
        "description": "Foamy, balanced, classic.",
        "options": {
            "size": STANDARD_SIZES,
            "milk": STANDARD_MILKS,
            "creamer": CREAMERS,
            "syrups": DEFAULT_SYRUPS,
            "sweetness": ["Unsweetened", "Light", "Sweet"],
        },
    },
    {
        "id": "mocha",
        "name": "Mocha",
        "description": "Chocolate and espresso for the cozy crowd.",
        "options": {
            "size": STANDARD_SIZES,
            "milk": STANDARD_MILKS,
            "creamer": CREAMERS,
            "syrups": DEFAULT_SYRUPS,
            "sweetness": ["Unsweetened", "Regular", "Extra chocolate"],
        },
    },
]

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def ensure_store():
    DATA_DIR.mkdir(exist_ok=True)
    if not ORDERS_FILE.exists():
        ORDERS_FILE.write_text("[]\n", encoding="utf-8")
    if not MENU_CONFIG_FILE.exists():
        write_menu_config(default_menu_config())


def read_orders():
    ensure_store()
    return json.loads(ORDERS_FILE.read_text(encoding="utf-8") or "[]")


def write_orders(orders):
    ensure_store()
    ORDERS_FILE.write_text(json.dumps(orders, indent=2) + "\n", encoding="utf-8")


def active_orders():
    return [order for order in read_orders() if not order.get("archivedAt")]


def default_menu_config():
    return {
        "drinks": [
            {
                "id": drink["id"],
                "name": drink["name"],
                "description": drink["description"],
                "available": True,
                "options": {
                    group: default_option_group(group, values)
                    for group, values in drink["options"].items()
                },
            }
            for drink in MENU
        ],
        "milks": [{"name": milk, "available": True} for milk in STANDARD_MILKS],
        "creamers": [{"name": creamer, "available": True} for creamer in CREAMERS],
        "syrups": [{"name": syrup, "available": True} for syrup in DEFAULT_SYRUPS],
    }


def default_option_group(group, values):
    if group in {"milk", "creamer", "syrups"}:
        return {"enabled": True, "defaultValue": ""}
    return {
        "enabled": True,
        "defaultValue": values[0] if values else "",
        "items": [{"name": item, "available": True} for item in values],
    }


def normalize_inventory_items(items, defaults, aliases=None):
    aliases = aliases or {}
    saved = {}
    for item in items or []:
        name = sanitize_text(item.get("name"))
        if not name:
            continue
        name = aliases.get(name, name)
        saved[name] = bool(item.get("available", True))

    merged = [{"name": value, "available": saved.get(value, True)} for value in defaults]
    for name, available in saved.items():
        if name not in defaults:
            merged.append({"name": name, "available": available})
    return merged


def merge_option_config(default_options, saved_options):
    saved_options = saved_options or {}
    merged = {}
    for group, values in default_options.items():
        saved_value = saved_options.get(group, {})
        if isinstance(saved_value, list):
            saved_items = saved_value
            enabled = True
        else:
            saved_items = saved_value.get("items", [])
            enabled = bool(saved_value.get("enabled", True))
        default_value = sanitize_text(saved_value.get("defaultValue", "")) if isinstance(saved_value, dict) else ""

        if group in {"milk", "creamer", "syrups"}:
            merged[group] = {"enabled": enabled, "defaultValue": default_value}
            continue

        saved_group = {}
        aliases = OPTION_ALIASES.get(group, {})
        for item in saved_items:
            name = sanitize_text(item.get("name"))
            if not name:
                continue
            name = aliases.get(name, name)
            saved_group[name] = bool(item.get("available", True))
        merged[group] = {
            "enabled": enabled,
            "defaultValue": default_value if default_value in values else (values[0] if values else ""),
            "items": [
                {"name": value, "available": saved_group.get(value, True)}
                for value in values
            ],
        }

        for name, available in saved_group.items():
            if group not in {"size", "milk", "creamer"} and name not in values:
                merged[group]["items"].append({"name": name, "available": available})
    return merged


def normalize_menu_config(config):
    config = config or {}
    saved_drinks = {
        sanitize_text(drink.get("id")): drink
        for drink in config.get("drinks", [])
        if sanitize_text(drink.get("id"))
    }

    drinks = []
    for default_drink in MENU:
        saved = saved_drinks.get(default_drink["id"], {})
        drinks.append(
            {
                "id": default_drink["id"],
                "name": sanitize_text(saved.get("name"), default_drink["name"])
                or default_drink["name"],
                "description": sanitize_text(
                    saved.get("description"), default_drink["description"]
                )
                or default_drink["description"],
                "available": bool(saved.get("available", True)),
                "options": merge_option_config(
                    default_drink["options"], saved.get("options", {})
                ),
            }
        )

    old_milks = []
    old_creamers = []
    for drink in config.get("drinks", []):
        options = drink.get("options", {})
        for group, target in [("milk", old_milks), ("creamer", old_creamers)]:
            value = options.get(group, {})
            if isinstance(value, list):
                target.extend(value)
            else:
                target.extend(value.get("items", []))

    saved_milks = config.get("milks") or old_milks
    saved_creamers = config.get("creamers") or old_creamers
    saved_syrups = config.get("syrups")

    return {
        "drinks": drinks,
        "milks": normalize_inventory_items(
            saved_milks, STANDARD_MILKS, OPTION_ALIASES.get("milk")
        ),
        "creamers": normalize_inventory_items(saved_creamers, CREAMERS),
        "syrups": normalize_inventory_items(saved_syrups, DEFAULT_SYRUPS),
    }


def read_menu_config():
    ensure_store()
    try:
        config = json.loads(MENU_CONFIG_FILE.read_text(encoding="utf-8") or "{}")
    except json.JSONDecodeError:
        config = default_menu_config()
    normalized = normalize_menu_config(config)
    if normalized != config:
        write_menu_config(normalized)
    return normalized


def write_menu_config(config):
    DATA_DIR.mkdir(exist_ok=True)
    MENU_CONFIG_FILE.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


def available_names(items):
    return [item["name"] for item in items if item.get("available")]


def options_for_group(drink_id, group, values):
    if group == "milk" and drink_id in MILK_REQUIRED_DRINKS:
        return [value for value in values if value != "None"]
    return values


def public_menu():
    config = read_menu_config()
    global_options = {
        "milk": available_names(config.get("milks", [])),
        "creamer": available_names(config.get("creamers", [])),
        "syrups": available_names(config.get("syrups", [])),
    }
    drinks = []
    for drink in config["drinks"]:
        if not drink.get("available"):
            continue

        options = {}
        defaults = {}
        for group, option_config in drink["options"].items():
            if isinstance(option_config, list):
                enabled = True
                items = option_config
            else:
                enabled = bool(option_config.get("enabled", True))
                items = option_config.get("items", [])
            if enabled:
                if group in global_options:
                    values = global_options[group]
                else:
                    values = available_names(items)
                options[group] = options_for_group(drink["id"], group, values)
                if group == "syrups":
                    continue
                default_value = ""
                if isinstance(option_config, dict):
                    default_value = sanitize_text(option_config.get("defaultValue", ""))
                if default_value not in options[group]:
                    default_value = options[group][0] if options[group] else ""
                defaults[group] = default_value
        if any(len(values) == 0 for values in options.values()):
            continue

        drinks.append(
            {
                "id": drink["id"],
                "name": drink["name"],
                "description": drink["description"],
                "options": options,
                "defaults": defaults,
            }
        )

    return {
        "menu": drinks,
        "milks": global_options["milk"],
        "creamers": global_options["creamer"],
        "syrups": global_options["syrups"],
    }


def sanitize_text(value, fallback=""):
    if value is None:
        value = fallback
    return str(value).strip()[:160]


def find_drink(drink_id):
    for drink in public_menu()["menu"]:
        if drink["id"] == drink_id:
            return drink
    return None


def normalize_order(payload):
    drink = find_drink(payload.get("drinkId"))
    if drink is None:
        raise ValueError("Please choose a drink from the menu.")

    selections = {}
    for group, values in drink["options"].items():
        if group == "syrups":
            continue
        fallback = drink.get("defaults", {}).get(group) or values[0]
        value = sanitize_text(payload.get(group), fallback)
        if not value:
            value = fallback
        if value not in values:
            raise ValueError("One of the selected options is not available for that drink.")
        selections[group] = value

    available_syrups = set(drink["options"].get("syrups", []))
    syrups = [
        sanitize_text(syrup)
        for syrup in payload.get("syrups", [])
        if sanitize_text(syrup)
    ]

    if any(syrup not in available_syrups for syrup in syrups):
        raise ValueError("One of the selected syrups is not available.")

    if selections.get("sweetness") == "Unsweetened" and syrups:
        raise ValueError("Syrups cannot be selected with unsweetened drinks.")

    timestamp = now_iso()
    return {
        "id": str(uuid.uuid4()),
        "name": sanitize_text(payload.get("name"), "Guest") or "Guest",
        "drinkId": drink["id"],
        "drinkName": drink["name"],
        "size": selections.get("size", ""),
        "milk": selections.get("milk", ""),
        "creamer": selections.get("creamer", ""),
        "sweetness": selections.get("sweetness", ""),
        "options": selections,
        "syrups": syrups,
        "notes": sanitize_text(payload.get("notes")),
        "deviceId": sanitize_text(payload.get("deviceId")),
        "status": "queued",
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }


def editable_order_fields(payload):
    normalized = normalize_order(payload)
    return {
        "name": normalized["name"],
        "drinkId": normalized["drinkId"],
        "drinkName": normalized["drinkName"],
        "size": normalized["size"],
        "milk": normalized["milk"],
        "creamer": normalized["creamer"],
        "sweetness": normalized["sweetness"],
        "options": normalized["options"],
        "syrups": normalized["syrups"],
        "notes": normalized["notes"],
        "deviceId": normalized["deviceId"],
        "updatedAt": now_iso(),
    }


def local_addresses():
    addresses = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, PORT, socket.AF_INET):
            address = info[4][0]
            if not address.startswith("127.") and address not in addresses:
                addresses.append(address)
    except socket.gaierror:
        pass
    return [f"http://{address}:{PORT}" for address in addresses]


class CoffeeHandler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw or "{}")

    def require_admin(self):
        password = self.headers.get("x-admin-password", "")
        if password == ADMIN_PASSWORD:
            return True
        self.send_json(401, {"error": "Admin password required."})
        return False

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/menu":
            self.send_json(200, public_menu())
            return
        if path == "/api/admin/config":
            if not self.require_admin():
                return
            self.send_json(200, read_menu_config())
            return
        if path == "/api/orders":
            self.send_json(200, {"orders": active_orders()})
            return
        if path == "/api/barista/orders":
            if not self.require_admin():
                return
            self.send_json(200, {"orders": active_orders()})
            return
        order_match = path.strip("/").split("/")
        if len(order_match) == 4 and order_match[:2] == ["api", "devices"] and order_match[3] == "orders":
            device_id = sanitize_text(order_match[2])
            orders = [
                order
                for order in read_orders()
                if sanitize_text(order.get("deviceId")) == device_id
            ][:25]
            self.send_json(200, {"orders": orders})
            return
        if len(order_match) == 3 and order_match[:2] == ["api", "orders"]:
            order_id = order_match[2]
            for order in read_orders():
                if order["id"] == order_id:
                    self.send_json(200, {"order": order})
                    return
            self.send_json(404, {"error": "Order not found."})
            return
        self.serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/orders/archive-completed":
            if not self.require_admin():
                return
            orders = read_orders()
            archived_at = now_iso()
            archived_count = 0
            for order in orders:
                if order.get("status") == "done" and not order.get("archivedAt"):
                    order["archivedAt"] = archived_at
                    order["updatedAt"] = archived_at
                    archived_count += 1
            write_orders(orders)
            self.send_json(200, {"archivedCount": archived_count})
            return

        if path != "/api/orders":
            self.send_json(404, {"error": "Not found."})
            return
        try:
            order = normalize_order(self.read_json())
            orders = read_orders()
            orders.insert(0, order)
            write_orders(orders)
            self.send_json(201, {"order": order})
        except (json.JSONDecodeError, ValueError) as error:
            self.send_json(400, {"error": str(error) or "Could not place order."})

    def do_PUT(self):
        if urlparse(self.path).path != "/api/admin/config":
            self.send_json(404, {"error": "Not found."})
            return
        if not self.require_admin():
            return
        try:
            config = normalize_menu_config(self.read_json())
            write_menu_config(config)
            self.send_json(200, config)
        except json.JSONDecodeError as error:
            self.send_json(400, {"error": str(error) or "Could not save config."})

    def do_PATCH(self):
        path = urlparse(self.path).path
        parts = path.strip("/").split("/")
        if len(parts) == 3 and parts[:2] == ["api", "orders"]:
            try:
                orders = read_orders()
                for order in orders:
                    if order["id"] == parts[2]:
                        if order["status"] != "queued":
                            self.send_json(
                                409,
                                {"error": "This order has already been started."},
                            )
                            return
                        order.update(editable_order_fields(self.read_json()))
                        write_orders(orders)
                        self.send_json(200, {"order": order})
                        return
                self.send_json(404, {"error": "Order not found."})
            except (json.JSONDecodeError, ValueError) as error:
                self.send_json(400, {"error": str(error) or "Could not update order."})
            return

        if len(parts) != 4 or parts[:2] != ["api", "orders"] or parts[3] != "status":
            self.send_json(404, {"error": "Not found."})
            return
        if not self.require_admin():
            return

        try:
            status = sanitize_text(self.read_json().get("status"))
            if status not in {"queued", "making", "ready", "done"}:
                raise ValueError("Unknown order status.")

            orders = read_orders()
            for order in orders:
                if order["id"] == parts[2]:
                    order["status"] = status
                    order["updatedAt"] = now_iso()
                    write_orders(orders)
                    self.send_json(200, {"order": order})
                    return
            self.send_json(404, {"error": "Order not found."})
        except (json.JSONDecodeError, ValueError) as error:
            self.send_json(400, {"error": str(error) or "Could not update order."})

    def serve_static(self, request_path):
        relative = "index.html" if request_path == "/" else request_path.lstrip("/")
        target = (PUBLIC_DIR / relative).resolve()
        if not str(target).startswith(str(PUBLIC_DIR.resolve())):
            self.send_error(403)
            return
        if not target.exists() or not target.is_file():
            self.send_error(404)
            return

        body = target.read_bytes()
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type == "application/javascript":
            content_type += "; charset=utf-8"

        self.send_response(200)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    ensure_store()
    server = ThreadingHTTPServer((HOST, PORT), CoffeeHandler)
    print(f"Coffee orders are brewing at http://localhost:{PORT}", flush=True)
    for address in local_addresses():
        print(f"Guests on your Wi-Fi can try {address}", flush=True)
    server.serve_forever()
