from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from conftest import load_plugin_module
from fake_plugin_context import FakePluginContext


def _make_client():
    ctx = FakePluginContext(db_module=MagicMock())
    load_plugin_module().Plugin().on_load(ctx)
    app = FastAPI()
    for _, router in ctx.registry.routers:
        app.include_router(router, prefix="/plugins/fake")
    return TestClient(app)


def test_install_url_rejects_non_https():
    client = _make_client()
    resp = client.post("/plugins/fake/install-url", json={"url": "http://example.com/plugin.zip"})
    assert resp.status_code == 422
    assert "https" in resp.json()["detail"]
