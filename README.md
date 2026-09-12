# anotherme-plugin-store

Browse, install, update, and remove community plugins for
[AnotherMe](https://github.com/MatousVavra/AnotherMe).

Extracted from the AnotherMe host repository at commit 9a6ef26 — prior
history lives there.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `COMMUNITY_INDEX_URL` | `https://raw.githubusercontent.com/MatousVavra/anotherme-plugins/main/plugins.json` | Host-level: where the app fetches the curated community plugin index |

## Development

Unit tests run standalone against `FakePluginContext`:

    pip install fastapi pydantic httpx pyyaml pytest pytest-asyncio openai
    pytest tests/ --ignore=tests/integration

Integration tests run inside the released app image (see
`.github/workflows/test.yml`). To develop against a live app, point
`COMMUNITY_PLUGINS_DIR` at this checkout's parent directory.

## Releases

Tag `vX.Y.Z` (must match `plugin/plugin.yaml` `version`), then bump the tag
in the [community index](https://github.com/MatousVavra/anotherme-plugins).
