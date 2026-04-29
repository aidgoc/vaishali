"""
Chat endpoints for the DSPL ERP AI service.

GET / DELETE /history are bridged to the Frappe-native persistent store
(``Vaishali Chat Log``) so conversation history survives sidecar restarts.
The POST /chat path still uses the in-memory cache for the current turn —
the agent itself stores its own copy in Vaishali Chat Log when it runs
inside Frappe via ``runner.py``.
"""

from __future__ import annotations

from collections import defaultdict

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ai.auth import ServiceUnavailableError, validate_frappe_session
from ai.runner import run_agent as _run_agent_real
from config import FRAPPE_URL, FRAPPE_SITE

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/ai", tags=["ai"])

# ---------------------------------------------------------------------------
# In-memory conversation history (current-turn cache only)
# ---------------------------------------------------------------------------

MAX_HISTORY = 50
_history: dict[str, list[dict]] = defaultdict(list)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class ChatResponse(BaseModel):
    response: str
    session_id: str


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _get_user_roles(user_email: str, cookie: str) -> list[str]:
    url = f"{FRAPPE_URL}/api/resource/User/{user_email}"
    params = {'fields': '["roles"]'}
    headers = {"Cookie": cookie, "Host": FRAPPE_SITE}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, headers=headers)
        if resp.status_code != 200:
            return ["Employee"]
        data = resp.json().get("data", {})
        roles_raw = data.get("roles", [])
        return [r["role"] for r in roles_raw if "role" in r] or ["Employee"]
    except Exception:
        return ["Employee"]


async def _run_agent(
    message: str,
    user: str,
    roles: list[str],
    cookie: str,
    history: list[dict],
) -> str:
    return await _run_agent_real(
        message=message,
        user_email=user,
        user_roles=roles,
        cookie=cookie,
        history=history,
    )


async def _frappe_call(method: str, http_method: str, cookie: str, params: dict | None = None) -> dict | None:
    """Invoke a Frappe whitelisted method as the cookie-authed user.

    Returns the unwrapped ``message`` payload on 200, ``None`` otherwise.
    """
    url = f"{FRAPPE_URL}/api/method/{method}"
    headers = {"Cookie": cookie, "Host": FRAPPE_SITE, "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if http_method == "GET":
                resp = await client.get(url, headers=headers, params=params or {})
            elif http_method == "DELETE":
                resp = await client.delete(url, headers=headers, params=params or {})
            else:
                return None
        if resp.status_code != 200:
            return None
        body = resp.json()
        return body.get("message", body)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: Request,
    body: ChatRequest,
):
    cookie = request.headers.get("cookie")
    if not cookie:
        raise HTTPException(status_code=401, detail="No session cookie provided")

    try:
        user = await validate_frappe_session(cookie)
    except ServiceUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    session_id = body.session_id or f"session_{user}"
    history = _history[session_id]

    roles = await _get_user_roles(user, cookie)

    history.append({"role": "user", "content": body.message})
    if len(history) > MAX_HISTORY:
        _history[session_id] = history[-MAX_HISTORY:]
        history = _history[session_id]

    ai_response = await _run_agent(
        message=body.message,
        user=user,
        roles=roles,
        cookie=cookie,
        history=history,
    )

    history.append({"role": "assistant", "content": ai_response})
    if len(history) > MAX_HISTORY:
        _history[session_id] = history[-MAX_HISTORY:]

    return ChatResponse(response=ai_response, session_id=session_id)


@router.get("/history")
async def get_history(
    request: Request,
    session_id: str,
):
    """Return persistent conversation history (Frappe Vaishali Chat Log).

    Falls back to the in-memory cache only if the Frappe call fails — this
    means the displayed list survives sidecar restarts because Frappe stores
    every turn the agent runs.
    """
    cookie = request.headers.get("cookie")
    if not cookie:
        raise HTTPException(status_code=401, detail="No session cookie provided")

    try:
        user = await validate_frappe_session(cookie)
    except ServiceUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    persisted = await _frappe_call("vaishali.api.chat.get_history", "GET", cookie)
    if persisted is not None:
        return {
            "session_id": persisted.get("conversation_id") or session_id,
            "history": persisted.get("history", []),
        }

    return {"session_id": session_id, "history": _history[session_id]}


@router.delete("/history")
async def clear_history(
    request: Request,
    session_id: str,
):
    """Clear the in-memory conversation cache.

    Does NOT touch ``Vaishali Chat Log``: Frappe's ``clear_history(None)``
    deletes every row for the user (not scoped to one conversation), which
    would wipe months of history with one tap. The "New" / "Clear" buttons
    in the PWA are scoped to the current view; the persistent store stays
    intact and the user can still see prior conversations from the desk.
    """
    cookie = request.headers.get("cookie")
    if not cookie:
        raise HTTPException(status_code=401, detail="No session cookie provided")

    try:
        user = await validate_frappe_session(cookie)
    except ServiceUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    _history.pop(session_id, None)
    return {"session_id": session_id, "cleared": True}
