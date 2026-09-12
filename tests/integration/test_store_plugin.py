"""Store plugin route tests (package manager mocked — no network)."""
from unittest.mock import patch

import pytest


@pytest.fixture
def fake_pm(tmp_path):
    from kernel.plugins.package import PluginPackageManager

    return PluginPackageManager(tmp_path / "installed", tmp_path / "state.json")


def _wire(make_client, fake_pm):
    """Point the live store plugin's ctx at the fake package manager."""
    client = make_client()
    import src.main
    src.main.plugin_manager.package_manager = fake_pm
    for info in src.main.plugin_manager.get_loaded_plugins().values():
        if info.get("context"):
            info["context"].package_manager = fake_pm
    return client


def test_store_list_merges_index_and_installed(make_client, fake_pm):
    import kernel.plugins.package as pkg_mod

    def fake_fetch(force=False):
        return [pkg_mod.IndexEntry(
            name="habit_tracker", repo="u/r", tag="v1.2.0",
            description="Tracks habits", author="Some One",
        )]

    client = _wire(make_client, fake_pm)
    with patch.object(fake_pm, "fetch_index", fake_fetch):
        resp = client.get("/plugins/store/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["plugins"][0]["name"] == "habit_tracker"
    assert data["plugins"][0]["installed"] is False
    assert data["plugins"][0]["update_available"] is False


def test_store_install_calls_index_install(make_client, fake_pm):
    client = _wire(make_client, fake_pm)
    with patch.object(fake_pm, "install_from_index") as install:
        install.return_value.name = "habit_tracker"
        install.return_value.version = "1.2.0"
        resp = client.post("/plugins/store/install", json={"name": "habit_tracker"})
    assert resp.status_code == 200
    install.assert_called_once_with("habit_tracker")


def test_store_install_url_marks_unreviewed(make_client, fake_pm):
    client = _wire(make_client, fake_pm)
    with patch.object(fake_pm, "install_from_url") as install_url:
        install_url.return_value.name = "sideloaded"
        install_url.return_value.version = "0.1.0"
        resp = client.post(
            "/plugins/store/install-url",
            json={"url": "https://example.com/p.zip"},
        )
    assert resp.status_code == 200
    assert resp.json()["reviewed"] is False
    install_url.assert_called_once_with("https://example.com/p.zip")


def test_store_install_invalid_returns_422(make_client, fake_pm):
    client = _wire(make_client, fake_pm)

    def boom(name):
        raise ValueError("archive invalid: path traversal")

    with patch.object(fake_pm, "install_from_index", boom):
        resp = client.post("/plugins/store/install", json={"name": "bad"})
    assert resp.status_code == 422
    assert "path traversal" in resp.json()["detail"]


def test_store_uninstall_bundled_returns_400(make_client, fake_pm):
    client = _wire(make_client, fake_pm)

    def bundled(name, purge=False):
        raise ValueError("bundled plugin 'store' - disable it instead")

    with patch.object(fake_pm, "uninstall", bundled):
        resp = client.post("/plugins/store/uninstall", json={"name": "store"})
    assert resp.status_code == 400


def test_store_uninstall_rejects_path_traversal(make_client, fake_pm):
    client = _wire(make_client, fake_pm)
    resp = client.post("/plugins/store/uninstall", json={"name": ".."})
    assert resp.status_code == 422


def test_store_update_rejects_invalid_name(make_client, fake_pm):
    client = _wire(make_client, fake_pm)
    resp = client.post("/plugins/store/update", json={"name": "../etc"})
    assert resp.status_code == 422


def test_store_uninstall_unknown_named_bundled_returns_404(make_client, fake_pm):
    client = _wire(make_client, fake_pm)
    with patch.object(fake_pm, "uninstall") as un:
        un.side_effect = ValueError("Plugin 'bundled' not found")
        resp = client.post("/plugins/store/uninstall", json={"name": "bundled"})
    assert resp.status_code == 404


def test_kernel_uninstall_rejects_outside_root(tmp_path):
    from kernel.plugins.package import PluginPackageManager
    pm = PluginPackageManager(tmp_path / "installed", tmp_path / "state.json",
                              community_dir=tmp_path / "community")
    (tmp_path / "community").mkdir(parents=True)
    with pytest.raises(ValueError, match="escapes the install root"):
        pm.uninstall("../installed")


def test_store_ui_fragment_served(make_client):
    client = make_client()
    resp = client.get("/plugins/store/ui/index.html")
    assert resp.status_code == 200
    assert b"storePlugin" in resp.content
    resp = client.get("/plugins/store/ui/index.js")
    assert resp.status_code == 200
