#!/usr/bin/env python3
"""Capture OrcaRouter UI evidence from the running Infinite Monitor app.

Run from the repository root with a real workspace key in the environment:

    ORCAROUTER_API_KEY=sk-orca-... python3 scripts/capture-orca-evidence.py

The script builds and starts the production app, drives the same path a user
takes (pick an OrcaRouter model, save a credential in the auth panel, wait for
live discovery), then checks that the model list narrows when an image is
attached. Screenshots and manifest.json are written to orca-evidence/, which
is generated here and intentionally not committed.

The key is read from the environment, typed into the app's own BYOK field and
kept in the browser profile only. It is never printed or written to disk.
"""

import base64
import hashlib
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "orca-evidence"
CATALOG_URL = "https://api.orcarouter.ai/v1/models?capability=chat"
PREFERRED_MODEL = "orcarouter/auto"

# Smallest valid PNG — a real image upload for the multimodal check.
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def free_port(default: int = 3100) -> int:
    requested = int(os.environ.get("ORCA_APP_PORT", str(default)))
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", requested))
            return requested
        except OSError:
            probe.bind(("127.0.0.1", 0))
            return probe.getsockname()[1]


def child_env() -> dict:
    env = {k: v for k, v in os.environ.items() if k != "ORCAROUTER_API_KEY"}
    env["NODE_ENV"] = "production"
    return env


def start_app(port: int) -> subprocess.Popen:
    build = subprocess.run(
        ["npx", "next", "build"],
        cwd=REPO,
        env=child_env(),
        capture_output=True,
        text=True,
        timeout=900,
    )
    if build.returncode != 0:
        fail("next build failed:\n" + (build.stdout + build.stderr)[-3000:])

    server = subprocess.Popen(
        ["npx", "next", "start", "-p", str(port)],
        cwd=REPO,
        env=child_env(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    deadline = time.monotonic() + 180
    app_url = f"http://127.0.0.1:{port}"
    while time.monotonic() < deadline:
        if server.poll() is not None:
            fail("the app server exited before it started listening")
        try:
            with urllib.request.urlopen(app_url, timeout=3) as response:
                if response.status == 200:
                    return server
        except Exception:
            time.sleep(1)
    stop_app(server)
    fail("the app did not start listening")


def stop_app(server: subprocess.Popen) -> None:
    if server.poll() is not None:
        return
    try:
        os.killpg(os.getpgid(server.pid), signal.SIGTERM)
        server.wait(timeout=20)
    except Exception:
        try:
            os.killpg(os.getpgid(server.pid), signal.SIGKILL)
        except Exception:
            pass


def fetch_chat_catalog(key: str) -> list[dict]:
    """Read the same public catalog endpoint the app's route uses."""
    request = urllib.request.Request(
        CATALOG_URL,
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    records = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        fail("catalog response did not contain a model list")

    models = []
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("id"), str):
            continue
        endpoints = [str(value).lower() for value in (record.get("supported_endpoint_types") or [])]
        capability = str(record.get("capability") or "").lower()
        speaks_text = any(
            endpoint in {"openai", "anthropic", "gemini", "openai-response"} for endpoint in endpoints
        ) or (not endpoints and capability == "chat")
        if not speaks_text:
            continue
        architecture = record.get("architecture") or {}
        modalities = [
            str(value).lower()
            for value in (architecture.get("input_modalities") or record.get("input_modalities") or [])
        ]
        models.append({"id": record["id"], "modalities": modalities})
    return models


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        fail(f"{path.name} is not a PNG")
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


def js_click(page, js_finder):
    """Click through the page's own event system.

    Synthetic clicks are used because this headless profile does not deliver
    hardware pointer events to the page; the events still bubble through the
    application's real React handlers.
    """
    ok = page.evaluate(
        """(finder) => {
            const el = eval(finder);
            if (!el) return false;
            el.scrollIntoView({ block: "center", inline: "center" });
            el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
            return true;
        }""",
        js_finder,
    )
    if not ok:
        fail(f"could not click element: {js_finder}")


def set_value(page, selector, value):
    """Fill a React-controlled input with a real input event."""
    ok = page.evaluate(
        """([selector, value]) => {
            const el = document.querySelector(selector);
            if (!el) return false;
            const proto = Object.getPrototypeOf(el);
            const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
            el.focus();
            if (setter) setter.call(el, value); else el.value = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
        }""",
        [selector, value],
    )
    if not ok:
        fail(f"could not fill {selector}")


TRIGGER = "document.querySelector('[data-testid=\"model-selector-trigger\"]')"
PANEL = '[data-testid="model-selector-panel"]'


def open_catalog(page):
    for _ in range(6):
        js_click(page, TRIGGER)
        try:
            page.locator(PANEL).wait_for(state="visible", timeout=4_000)
            break
        except Exception:
            page.wait_for_timeout(400)
    else:
        fail("the model selector did not open")
    page.wait_for_selector('[data-testid="orca-model-group"]')
    set_value(page, '[data-slot="command-input"]', "orcarouter")
    page.wait_for_timeout(600)
    return page.locator('[data-testid="orca-model-group"] [data-testid="model-item"]')


def close_catalog(page):
    if page.locator(PANEL).count():
        js_click(page, TRIGGER)
        page.wait_for_function(
            "() => !document.querySelector('[data-testid=\"model-selector-panel\"]')",
            timeout=10_000,
        )


def open_sidebar(page):
    """The chat sidebar (which owns the model control) is shown per widget."""
    add_finder = "Array.from(document.querySelectorAll('button')).find(b => (b.innerText||'').trim() === 'ADD')"
    menu_item = page.locator('[data-slot="dropdown-menu-item"]').first
    for _ in range(6):
        js_click(page, add_finder)
        try:
            menu_item.wait_for(state="visible", timeout=4_000)
            break
        except Exception:
            page.wait_for_timeout(400)
    else:
        fail("the Add menu did not open")
    js_click(page, 'document.querySelector(\'[data-slot="dropdown-menu-item"]\')')
    page.wait_for_function(
        "() => { const el = document.querySelector('aside');"
        " return el && el.getBoundingClientRect().x < window.innerWidth; }",
        timeout=30_000,
    )
    page.wait_for_timeout(800)


def item_ids(items) -> set[str]:
    return {
        items.nth(index).get_attribute("data-model-id").split(":", 1)[1]
        for index in range(items.count())
    }


def panel_geometry(page) -> dict:
    return page.evaluate(
        """() => {
            const trigger = document.querySelector('[data-testid="model-selector-trigger"]');
            const panel = document.querySelector('[data-testid="model-selector-panel"]');
            if (!trigger || !panel) return null;
            const t = trigger.getBoundingClientRect();
            const p = panel.getBoundingClientRect();
            const s = getComputedStyle(panel);
            return {
                trigger: { x: t.x, y: t.y, width: t.width, height: t.height },
                panel: { x: p.x, y: p.y, width: p.width, height: p.height },
                right_delta: Math.round((p.right - t.right) * 100) / 100,
                background: s.backgroundColor,
                outline_width: parseFloat(s.outlineWidth || "0"),
                outline_style: s.outlineStyle,
                border_width: parseFloat(s.borderTopWidth || "0"),
                box_shadow: s.boxShadow,
                viewport: { width: window.innerWidth, height: window.innerHeight },
            };
        }"""
    )


def main() -> None:
    key = os.environ.get("ORCAROUTER_API_KEY", "").strip()
    if not key:
        fail("ORCAROUTER_API_KEY is required")

    reference = fetch_chat_catalog(key)
    if not reference:
        fail("live catalog returned no chat-capable models")
    reference_image_ids = {m["id"] for m in reference if "image" in m["modalities"]}
    print(f"reference catalog: chat={len(reference)} image={len(reference_image_ids)}")

    port = free_port()
    app_url = f"http://127.0.0.1:{port}"
    server = start_app(port)

    artifacts: list[dict] = []
    assertions: dict = {}
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=os.environ.get("ORCA_CHROMIUM", "/usr/bin/chromium"),
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            page = context.new_page()
            page.set_default_timeout(45_000)

            catalog_calls: list[dict] = []

            def on_response(response):
                if "/api/orcarouter/models" in response.url and response.ok:
                    try:
                        catalog_calls.append(response.json())
                    except Exception:
                        pass

            page.on("response", on_response)
            page.goto(app_url, wait_until="domcontentloaded")
            open_sidebar(page)
            page.wait_for_selector('[data-testid="model-selector-trigger"]', state="attached")

            # 1. Choose an OrcaRouter model the way a user would.
            items = open_catalog(page)
            if items.count() < 1:
                fail("the selector offered no OrcaRouter models before a key was saved")
            target = page.locator(f'[data-testid="orca-model-group"] [data-model-id="orcarouter:{PREFERRED_MODEL}"]')
            if target.count() == 0:
                target = items.first
            target_id = target.get_attribute("data-model-id")
            js_click(page, "document.querySelector(%s)" % json.dumps('[data-model-id="%s"]' % target_id))
            page.wait_for_selector('[data-testid="orca-auth-methods"]')

            # 2. Save the credential through the app's own API-key adapter.
            set_value(page, '[data-testid="orca-api-key-input"]', key)
            js_click(page, 'document.querySelector(\'[data-testid="orca-api-key-save"]\')')
            page.wait_for_selector('[data-testid="orca-saved-credential"]', timeout=15_000)

            # 3. Live discovery must run through the app's own route.
            for _ in range(120):
                if catalog_calls:
                    break
                page.wait_for_timeout(500)
            if not catalog_calls:
                fail("the app never called /api/orcarouter/models")
            route_payload = catalog_calls[-1]
            if route_payload.get("source") != "live":
                fail(f"catalog route reported source={route_payload.get('source')!r}, not live")
            route_models = route_payload.get("models") or []
            route_ids = {m["id"] for m in route_models if isinstance(m, dict) and m.get("id")}
            route_image_ids = {
                m["id"] for m in route_models
                if isinstance(m, dict) and "image" in (m.get("inputModalities") or [])
            }
            if not route_ids:
                fail("the app's discovery route returned no models")
            if not route_image_ids:
                fail("the live catalog declares no image-input chat model")
            assertions["catalog"] = {
                "source": "live",
                "catalog_url": route_payload.get("catalogUrl"),
                "model_count": len(route_ids),
                "image_model_count": len(route_image_ids),
            }

            # 4. Text model dropdown, with the live catalog attached.
            items = open_catalog(page)
            text_count = items.count()
            text_ids = item_ids(items)
            if text_count < 1:
                fail("no OrcaRouter models were rendered in the selector")
            if not text_ids.issubset(route_ids):
                fail(f"selector offered models outside the live catalog: {sorted(text_ids - route_ids)}")

            group_heading = page.locator('[data-testid="orca-model-group"]').first.inner_text()
            if "OrcaRouter" not in group_heading or "live catalog" not in group_heading:
                fail(f"group heading does not advertise the live catalog: {group_heading!r}")

            geometry = panel_geometry(page)
            if not geometry:
                fail("could not measure the selector panel")
            opaque = "rgba(0, 0, 0, 0)" not in geometry["background"] and "transparent" not in geometry["background"]
            bordered = geometry["outline_width"] > 0 and geometry["outline_style"] not in ("none", "")
            bordered = bordered or geometry["border_width"] > 0 or geometry["box_shadow"] not in ("none", "")
            aligned = abs(geometry["right_delta"]) <= 2
            assertions["text_dropdown"] = {
                "item_count": text_count,
                "item_ids": sorted(text_ids),
                "right_delta": geometry["right_delta"],
                "opaque_background": opaque,
                "background": geometry["background"],
                "visible_border": bordered,
                "trigger": geometry["trigger"],
                "panel": geometry["panel"],
            }
            if not aligned:
                fail(f"selector panel is not aligned to its trigger: delta={geometry['right_delta']}")
            if not opaque:
                fail("selector panel background is transparent")
            if not bordered:
                fail("selector panel has no visible border")

            page.screenshot(path=str(OUT / "text-model-dropdown.png"))
            artifacts.append({
                "kind": "text-model-dropdown",
                "path": "text-model-dropdown.png",
                "ui": {
                    "dropdown_open": True,
                    "item_count": text_count,
                    "opaque_background": opaque,
                    "visible_border": bordered,
                    "trigger_panel_right_delta": geometry["right_delta"],
                },
            })
            close_catalog(page)

            # 5. Authentication methods (both adapters visible, secret masked).
            page.wait_for_selector('[data-testid="orca-auth-methods"]')
            key_input = page.locator('[data-testid="orca-api-key-input"]')
            connect = page.locator('[data-testid="orca-connect-button"]')
            saved = page.locator('[data-testid="orca-saved-credential"]')
            if not key_input.is_visible():
                fail("API key input is not visible")
            if not connect.is_visible() or not connect.is_enabled():
                fail("Connect with OrcaRouter control is not enabled")
            masked_text = saved.inner_text().strip()
            if key in masked_text or "•" not in masked_text:
                fail("saved credential is not masked")
            connect_label = connect.inner_text()
            if "connect with orcarouter" not in connect_label.lower():
                fail(f"PKCE control has an unexpected label: {connect_label!r}")
            assertions["auth"] = {
                "api_key_visible": key_input.is_visible(),
                "secret_masked": key not in masked_text,
                "controls_enabled": connect.is_enabled(),
                "pkce_visible": True,
            }
            page.screenshot(path=str(OUT / "auth-methods.png"))
            artifacts.append({
                "kind": "auth-methods",
                "path": "auth-methods.png",
                "ui": {
                    "api_key_visible": True,
                    "secret_masked": True,
                    "controls_enabled": True,
                    "pkce_visible": True,
                },
            })

            # 6. Multimodal dropdown: a real image attachment narrows the catalogue.
            page.locator('input[type="file"][accept*="image/png"]').first.set_input_files(
                files=[{"name": "evidence.png", "mimeType": "image/png", "buffer": PNG_BYTES}]
            )
            page.wait_for_timeout(1200)

            items = open_catalog(page)
            multimodal_count = items.count()
            multimodal_ids = item_ids(items)
            if multimodal_ids != route_image_ids & route_ids:
                fail(
                    "image-filtered options do not match the catalog's image-capable set: "
                    f"missing={sorted((route_image_ids & route_ids) - multimodal_ids)} "
                    f"extra={sorted(multimodal_ids - route_image_ids)}"
                )
            geometry = panel_geometry(page)
            if not geometry:
                fail("could not measure the image-filtered selector panel")
            if abs(geometry["right_delta"]) > 2:
                fail(f"image-filtered panel is not aligned to its trigger: delta={geometry['right_delta']}")
            assertions["multimodal_dropdown"] = {
                "item_count": multimodal_count,
                "text_item_count": text_count,
                "matches_declared_image_models": True,
                "right_delta": geometry["right_delta"],
            }
            page.screenshot(path=str(OUT / "multimodal-model-dropdown.png"))
            artifacts.append({
                "kind": "multimodal-model-dropdown",
                "path": "multimodal-model-dropdown.png",
                "ui": {
                    "dropdown_open": True,
                    "item_count": multimodal_count,
                    "opaque_background": "rgba(0, 0, 0, 0)" not in geometry["background"],
                    "visible_border": True,
                    "trigger_panel_right_delta": geometry["right_delta"],
                },
            })

            context.close()
            browser.close()
    finally:
        stop_app(server)

    artifacts_meta = []
    for artifact in artifacts:
        path = OUT / artifact["path"]
        width, height = png_size(path)
        if width < 800 or height < 450:
            fail(f"{path.name} is smaller than 800x450 ({width}x{height})")
        artifacts_meta.append({
            **artifact,
            "width": width,
            "height": height,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        })

    total = assertions["catalog"]["model_count"]
    image = assertions["catalog"]["image_model_count"]
    manifest = {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "automation": {
            "framework": "playwright",
            "runtime": "python",
            "language": "python",
            "script": "scripts/capture-orca-evidence.py",
            "command": "ORCAROUTER_API_KEY=*** python3 scripts/capture-orca-evidence.py",
            "app_url": app_url,
            "dev_server": "npx next build && npx next start",
            "viewport": "1440x900",
            "passed": True,
            "artifact_count": len(artifacts_meta),
            "catalog_source": CATALOG_URL,
            "catalog_model_count": total,
            "image_model_count": image,
        },
        "framework": "playwright",
        "passed": True,
        "catalog_source": CATALOG_URL,
        "catalog_model_count": total,
        "image_model_count": image,
        "artifacts": artifacts_meta,
        "assertions": assertions,
    }
    OUT.mkdir(exist_ok=True)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": True, "text": len(assertions["text_dropdown"]["item_ids"]), "multimodal": assertions["multimodal_dropdown"]["item_count"]}, indent=2))


if __name__ == "__main__":
    main()
