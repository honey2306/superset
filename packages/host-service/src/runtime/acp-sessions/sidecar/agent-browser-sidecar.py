#!/usr/bin/env python3
"""Conversation-scoped Browser Use adapter for Superset's Electron pages.

stdin/stdout is newline-delimited JSON. Electron remains the only target
lifecycle owner; this process only focuses an exact allowlisted target and runs
Browser Use SDK observations/actions against it.
"""

import asyncio
import json
import sys
from typing import Any

from browser_use import BrowserSession
from browser_use.browser.events import (
    ClickElementEvent,
    GoBackEvent,
    NavigateToUrlEvent,
    ScrollEvent,
    SwitchTabEvent,
    TypeTextEvent,
)

browser_session: BrowserSession | None = None
connected_cdp_url: str | None = None


def emit(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def target_identifier(target: Any) -> str | None:
    if isinstance(target, dict):
        value = target.get("target_id") or target.get("targetId")
        return value if isinstance(value, str) else None
    value = getattr(target, "target_id", None)
    return value if isinstance(value, str) else None


async def ensure_focused(request: dict[str, Any]) -> BrowserSession:
    global browser_session, connected_cdp_url
    cdp_url = request.get("cdpUrl")
    target_id = request.get("targetId")
    allowed = request.get("allowedTargetIds")
    if not isinstance(cdp_url, str) or not cdp_url:
        raise RuntimeError("Superset Browser CDP URL is missing")
    if not isinstance(target_id, str) or not target_id:
        raise RuntimeError("Superset Browser target id is missing")
    if not isinstance(allowed, list) or target_id not in allowed:
        raise RuntimeError("Refusing to focus a target outside this conversation")

    if browser_session is None or connected_cdp_url != cdp_url:
        if browser_session is not None:
            await browser_session.stop()
        browser_session = BrowserSession(cdp_url=cdp_url, keep_alive=True)
        await browser_session.start()
        connected_cdp_url = cdp_url

    actual_targets = {
        value
        for target in browser_session.get_page_targets()
        if (value := target_identifier(target)) is not None
    }
    if target_id not in actual_targets:
        raise RuntimeError("Superset Browser target is not present in Electron CDP")

    current = await browser_session.get_current_target_info()
    current_target_id = target_identifier(current)
    if current_target_id != target_id:
        focus_event = browser_session.event_bus.dispatch(
            SwitchTabEvent(target_id=target_id)
        )
        await focus_event
        current = await browser_session.get_current_target_info()
        current_target_id = target_identifier(current)
    if current_target_id != target_id:
        raise RuntimeError("Browser Use focused a different target than Superset requested")
    if current_target_id not in allowed:
        raise RuntimeError("Browser Use escaped the conversation target allowlist")
    return browser_session


async def cleaned_state(session: BrowserSession, state: Any) -> dict[str, Any]:
    result: dict[str, Any] = {
        "url": state.url,
        "title": state.title,
        "domText": state.dom_state.llm_representation(),
        "interactiveElements": [],
    }
    if state.page_info:
        result["viewport"] = {
            "width": state.page_info.viewport_width,
            "height": state.page_info.viewport_height,
        }
        result["page"] = {
            "width": state.page_info.page_width,
            "height": state.page_info.page_height,
        }
        result["scroll"] = {
            "x": state.page_info.scroll_x,
            "y": state.page_info.scroll_y,
        }
    cdp_session = await session.get_or_create_cdp_session(
        target_id=None, focus=False
    )
    if cdp_session:
        form_result = await cdp_session.cdp_client.send.Runtime.evaluate(
            params={
                "expression": """
(() => [...document.querySelectorAll(
  'input, textarea, select, [contenteditable=true]'
)]
  .filter((element) => element.isContentEditable || (
    element.getAttribute('type') !== 'hidden' &&
    element.getClientRects().length > 0
  ))
  .map((element) => {
    const type = element.getAttribute('type') || undefined;
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || undefined,
      name: element.getAttribute('name') || undefined,
      type,
      placeholder: element.getAttribute('placeholder') || undefined,
      value: type === 'password'
        ? '<redacted>'
        : (element.isContentEditable ? element.innerText : element.value),
    };
  }))()
""",
                "returnByValue": True,
            },
            session_id=cdp_session.session_id,
        )
        form_values = form_result.get("result", {}).get("value")
        if isinstance(form_values, list):
            result["formValues"] = form_values

    for index, element in state.dom_state.selector_map.items():
        item: dict[str, Any] = {
            "index": index,
            "tag": element.tag_name,
            "text": element.get_all_children_text(max_depth=2)[:200],
        }
        if element.node_value:
            item["value"] = element.node_value
        for attribute in (
            "placeholder",
            "href",
            "aria-label",
            "role",
            "type",
            "value",
        ):
            value = element.attributes.get(attribute)
            if value:
                item[attribute] = value
        result["interactiveElements"].append(item)
    return result


async def execute(request: dict[str, Any]) -> Any:
    session = await ensure_focused(request)
    name = request.get("name")
    arguments = request.get("arguments") or {}

    if name == "browser_get_state":
        state = await session.get_browser_state_summary(include_screenshot=False)
        return await cleaned_state(session, state)
    if name == "browser_navigate":
        url = arguments.get("url")
        if not isinstance(url, str) or not url:
            raise RuntimeError("url is required")
        event = session.event_bus.dispatch(NavigateToUrlEvent(url=url, new_tab=False))
        await event
        return {"url": url}
    if name == "browser_click":
        index = arguments.get("index")
        if not isinstance(index, int) or index < 0:
            raise RuntimeError("index must be a non-negative integer")
        node = await session.get_dom_element_by_index(index)
        if node is None:
            raise RuntimeError(f"Element index {index} was not found")
        await session.event_bus.dispatch(ClickElementEvent(node=node))
        return {"clicked": index}
    if name == "browser_type":
        index = arguments.get("index")
        text = arguments.get("text")
        if not isinstance(index, int) or index < 0:
            raise RuntimeError("index must be a non-negative integer")
        if not isinstance(text, str):
            raise RuntimeError("text is required")
        node = await session.get_dom_element_by_index(index)
        if node is None:
            raise RuntimeError(f"Element index {index} was not found")
        await session.event_bus.dispatch(
            TypeTextEvent(
                node=node,
                text=text,
                clear=arguments.get("clear", True) is not False,
            )
        )
        return {"typed": index}
    if name == "browser_scroll":
        direction = arguments.get("direction", "down")
        if direction not in ("up", "down", "left", "right"):
            raise RuntimeError("Invalid scroll direction")
        amount = arguments.get("amount", 600)
        if not isinstance(amount, int) or amount < 1 or amount > 10000:
            raise RuntimeError("amount must be between 1 and 10000")
        await session.event_bus.dispatch(ScrollEvent(direction=direction, amount=amount))
        return {"direction": direction, "amount": amount}
    if name == "browser_go_back":
        await session.event_bus.dispatch(GoBackEvent())
        return {"success": True}
    raise RuntimeError(f"Unsupported Browser Use action: {name}")


async def main() -> None:
    global browser_session
    while True:
        line = await asyncio.to_thread(sys.stdin.readline)
        if not line:
            break
        request: dict[str, Any] | None = None
        try:
            request = json.loads(line)
            result = await execute(request)
            emit({"id": request.get("id"), "ok": True, "result": result})
        except Exception as error:
            emit(
                {
                    "id": request.get("id") if request else None,
                    "ok": False,
                    "error": str(error),
                }
            )
    if browser_session is not None:
        await browser_session.stop()


if __name__ == "__main__":
    asyncio.run(main())
