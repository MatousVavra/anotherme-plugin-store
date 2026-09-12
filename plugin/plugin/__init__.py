import asyncio
import re

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field


def _norm_version(v: str) -> str:
    """Strip a leading 'v'/'V' so versions compare cleanly with index tags."""
    return v.strip().lstrip("vV")


class InstallRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class UrlRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


def _plugin_name_valid(name: str) -> bool:
    return bool(re.fullmatch(r"[a-z0-9_]+", name))


class Plugin:
    def on_load(self, ctx):
        # Keep the context, not the manager instance: tests and reloads rebind
        # ctx.package_manager after load, so resolve it lazily per request.
        self._ctx = ctx
        router = APIRouter()

        @router.get("")
        async def list_plugins():
            try:
                return await asyncio.to_thread(self._list)
            except ValueError as e:
                raise HTTPException(503, f"community index unavailable: {e}")

        @router.post("/install")
        async def install(req: InstallRequest):
            if not _plugin_name_valid(req.name):
                raise HTTPException(422, "invalid plugin name")
            try:
                pkg = await asyncio.to_thread(self._pm.install_from_index, req.name)
            except ValueError as e:
                msg = str(e)
                if "not in community index" in msg:
                    raise HTTPException(404, msg)
                if "already installed" in msg:
                    raise HTTPException(409, msg)
                raise HTTPException(422, msg)
            return {"name": pkg.name, "version": pkg.version, "reviewed": True}

        @router.post("/install-url")
        async def install_url(req: UrlRequest):
            try:
                pkg = await asyncio.to_thread(self._pm.install_from_url, req.url)
            except ValueError as e:
                raise HTTPException(422, str(e))
            return {"name": pkg.name, "version": pkg.version, "reviewed": False}

        @router.post("/update")
        async def update(req: InstallRequest):
            if not _plugin_name_valid(req.name):
                raise HTTPException(422, "invalid plugin name")
            try:
                pkg = await asyncio.to_thread(self._pm.update, req.name)
            except ValueError as e:
                msg = str(e)
                if "already up to date" in msg:
                    return Response(status_code=204)
                if "not found" in msg:
                    raise HTTPException(404, msg)
                if "bundled" in msg:
                    raise HTTPException(400, msg)
                raise HTTPException(422, msg)
            return {"name": pkg.name, "version": pkg.version}

        @router.post("/uninstall")
        async def uninstall(req: InstallRequest):
            if not _plugin_name_valid(req.name):
                raise HTTPException(422, "invalid plugin name")
            try:
                await asyncio.to_thread(self._pm.uninstall, req.name)
            except ValueError as e:
                msg = str(e)
                if "not found" in msg:
                    raise HTTPException(404, msg)
                if "bundled" in msg:
                    raise HTTPException(400, msg)
                raise HTTPException(422, msg)
            return {"uninstalled": req.name}

        @router.post("/refresh")
        async def refresh():
            try:
                await asyncio.to_thread(self._pm.fetch_index, True)
            except ValueError as e:
                raise HTTPException(503, f"community index unavailable: {e}")
            return await asyncio.to_thread(self._list)

        ctx.register_router(router)

    @property
    def _pm(self):
        return self._ctx.package_manager

    def _list(self) -> dict:
        entries = self._pm.fetch_index()
        installed = {p.name: p for p in self._pm.list()}
        plugins = []
        for e in entries:
            pkg = installed.get(e.name)
            plugins.append({
                "name": e.name,
                "description": e.description,
                "author": e.author,
                "tag": e.tag,
                "installed": pkg is not None,
                "installed_version": pkg.version if pkg else None,
                "update_available": bool(
                    pkg and _norm_version(pkg.version) != _norm_version(e.tag)
                ),
                "bundled": self._pm.is_bundled(e.name),
            })
        return {
            "plugins": plugins,
            "stale": self._pm.index_stale,
            "fetched_at": self._pm.index_fetched_at,
        }
