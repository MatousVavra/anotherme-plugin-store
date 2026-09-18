function storePlugin() {
    return {
        plugins: [],
        stale: false,
        loading: false,
        busy: {},
        sideloadUrl: '',
        sideloadBusy: false,
        search: '',

        get filteredPlugins() {
            const q = this.search.trim().toLowerCase();
            if (!q) return this.plugins;
            return this.plugins.filter(p =>
                (p.name || '').toLowerCase().includes(q) ||
                (p.description || '').toLowerCase().includes(q));
        },

        async init() {
            this._injectStyles();
            await this.load();
        },

        _injectStyles() {
            if (document.getElementById('store-plugin-css')) return;
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/plugins/store/ui/style.css';
            link.id = 'store-plugin-css';
            document.head.appendChild(link);
        },

        async load() {
            this.loading = true;
            try {
                const resp = await AM.fetch('/plugins/store/');
                if (!resp) return;
                if (!resp.ok) { this.stale = true; AM.toast('Failed to load plugin list', 'error'); return; }
                const data = await resp.json();
                this.plugins = data.plugins || [];
                this.stale = data.stale || false;
            } catch (e) {
                this.stale = true;
                AM.toast('Failed to load plugin list', 'error');
            } finally {
                this.loading = false;
            }
        },

        async refresh() {
            this.loading = true;
            try {
                const resp = await AM.fetch('/plugins/store/refresh', { method: 'POST' });
                if (!resp) return;
                if (!resp.ok) { this.stale = true; AM.toast('Failed to refresh index', 'error'); return; }
                const data = await resp.json();
                this.plugins = data.plugins || [];
                this.stale = data.stale || false;
            } catch (e) {
                this.stale = true;
                AM.toast('Failed to refresh index', 'error');
            } finally {
                this.loading = false;
            }
        },

        async _refreshShell() {
            const shell = window.Alpine && Alpine.store('shell');
            if (shell && shell.refreshPlugins) {
                try { await shell.refreshPlugins(); } catch (e) { }
            }
        },

        async _request(action, path, body, successMsg) {
            try {
                const resp = await AM.fetch(path, { method: 'POST', body });
                if (!resp) return false;
                if (!resp.ok) {
                    const data = await resp.json().catch(() => ({}));
                    const detail = typeof data.detail === 'string' ? data.detail : 'HTTP ' + resp.status;
                    AM.toast(action + ' failed: ' + detail, 'error');
                    return false;
                }
                AM.toast(successMsg, 'success');
                await this._refreshShell();
                await this.load();
                return true;
            } catch (e) {
                AM.toast(action + ' failed: ' + e.message, 'error');
                return false;
            }
        },

        async install(p) {
            if (this.busy[p.name]) return;
            this.busy[p.name] = 'installing';
            try {
                await this._request('Install', '/plugins/store/install', { name: p.name }, 'Installed ' + p.name);
            } finally {
                this.busy[p.name] = false;
            }
        },

        async update(p) {
            if (this.busy[p.name]) return;
            this.busy[p.name] = 'updating';
            try {
                const resp = await AM.fetch('/plugins/store/update', { method: 'POST', body: { name: p.name } });
                if (resp && resp.ok) {
                    if (resp.status === 204) {
                        AM.toast(p.name + ' is already up to date', 'info');
                    } else {
                        AM.toast('Updated ' + p.name, 'success');
                    }
                    await this._refreshShell();
                    await this.load();
                } else if (resp) {
                    const data = await resp.json().catch(() => ({}));
                    const detail = typeof data.detail === 'string' ? data.detail : 'HTTP ' + resp.status;
                    AM.toast('Update failed: ' + detail, 'error');
                }
            } catch (e) {
                AM.toast('Update failed: ' + e.message, 'error');
            } finally {
                this.busy[p.name] = false;
            }
        },

        uninstall(p) {
            if (this.busy[p.name]) return;
            const html = `
                <div class="settings-modal" style="width: 400px;">
                    <h3>Remove plugin</h3>
                    <p class="store-confirm-text">Remove "${AM.utils.escapeHtml(p.name)}"? Its data stays in the database.</p>
                    <div class="store-confirm-actions">
                        <button class="btn-secondary" id="store-uninstall-cancel">Cancel</button>
                        <button class="btn-danger" id="store-uninstall-confirm">Remove</button>
                    </div>
                </div>`;
            const m = AM.modal(html);
            document.getElementById('store-uninstall-cancel').onclick = () => m.close();
            document.getElementById('store-uninstall-confirm').onclick = () => {
                m.close();
                this._uninstall(p);
            };
        },

        async _uninstall(p) {
            this.busy[p.name] = 'removing';
            try {
                await this._request('Remove', '/plugins/store/uninstall', { name: p.name }, 'Removed ' + p.name);
            } finally {
                this.busy[p.name] = false;
            }
        },

        sideload() {
            if (!this.sideloadUrl) return;
            const url = this.sideloadUrl;
            const html = `
                <div class="settings-modal" style="width: 420px;">
                    <h3>Install unreviewed plugin?</h3>
                    <p class="store-confirm-text"><code>${AM.utils.escapeHtml(url)}</code></p>
                    <p class="store-warning">
                        This plugin was not reviewed. It will run with full access to your
                        vault and AI keys. Only continue if you trust this source.
                    </p>
                    <div class="store-confirm-actions">
                        <button class="btn-secondary" id="store-sideload-cancel">Cancel</button>
                        <button class="btn-danger" id="store-sideload-confirm">Install anyway</button>
                    </div>
                </div>`;
            const m = AM.modal(html);
            document.getElementById('store-sideload-cancel').onclick = () => m.close();
            document.getElementById('store-sideload-confirm').onclick = () => {
                m.close();
                this._sideload(url);
            };
        },

        async _sideload(url) {
            if (this.sideloadBusy) return;
            this.sideloadBusy = true;
            try {
                const resp = await AM.fetch('/plugins/store/install-url', { method: 'POST', body: { url } });
                if (!resp) return;
                if (!resp.ok) {
                    const data = await resp.json().catch(() => ({}));
                    const detail = typeof data.detail === 'string' ? data.detail : 'HTTP ' + resp.status;
                    AM.toast('Install failed: ' + detail, 'error');
                    return;
                }
                const data = await resp.json();
                AM.toast('Installed ' + data.name, 'success');
                this.sideloadUrl = '';
                await this._refreshShell();
                await this.load();
            } catch (e) {
                AM.toast('Install failed: ' + e.message, 'error');
            } finally {
                this.sideloadBusy = false;
            }
        },
    };
}
