function storePlugin() {
    return {
        plugins: [],
        stale: false,
        loading: false,
        sideloadUrl: '',
        confirmUrl: null,
        errorMessage: '',

        async _fail(action, resp) {
            const data = await resp.json().catch(() => ({}));
            const detail = typeof data.detail === 'string' ? data.detail : null;
            this.errorMessage = `${action} failed: ${detail || `HTTP ${resp.status}`}`;
        },

        async init() {
            await this.load();
        },

        async load() {
            this.loading = true;
            try {
                const resp = await AM.fetch('/plugins/store/');
                if (!resp) return;
                if (!resp.ok) { this.stale = true; return; }
                const data = await resp.json();
                this.plugins = data.plugins || [];
                this.stale = data.stale || false;
            } catch (e) {
                console.error('Store load', e);
                this.stale = true;
            } finally {
                this.loading = false;
            }
        },

        async refresh() {
            this.loading = true;
            try {
                const resp = await AM.fetch('/plugins/store/refresh', { method: 'POST' });
                if (!resp) return;
                if (!resp.ok) { this.stale = true; return; }
                const data = await resp.json();
                this.plugins = data.plugins || [];
                this.stale = data.stale || false;
            } catch (e) {
                console.error('Store refresh', e);
                this.stale = true;
            } finally {
                this.loading = false;
            }
        },

        async install(p) {
            this.errorMessage = '';
            this.loading = true;
            try {
                const resp = await AM.fetch('/plugins/store/install', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: p.name }),
                });
                if (!resp) return;
                if (!resp.ok) return this._fail('Install', resp);
                this.errorMessage = '';
                await this.load();
            } finally {
                this.loading = false;
            }
        },

        async update(p) {
            this.errorMessage = '';
            this.loading = true;
            try {
                const resp = await AM.fetch('/plugins/store/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: p.name }),
                });
                if (!resp) return;
                if (!resp.ok) return this._fail('Update', resp);
                this.errorMessage = '';
                await this.load();
            } finally {
                this.loading = false;
            }
        },

        async uninstall(p) {
            if (!confirm(`Remove plugin "${p.name}"? Its data stays in the database.`)) return;
            this.errorMessage = '';
            this.loading = true;
            try {
                const resp = await AM.fetch('/plugins/store/uninstall', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: p.name }),
                });
                if (!resp) return;
                if (!resp.ok) return this._fail('Remove', resp);
                this.errorMessage = '';
                await this.load();
            } finally {
                this.loading = false;
            }
        },

        sideload() {
            if (!this.sideloadUrl) return;
            this.confirmUrl = this.sideloadUrl;
        },

        async confirmSideload() {
            const url = this.confirmUrl;
            this.confirmUrl = null;
            this.sideloadUrl = '';
            this.errorMessage = '';
            this.loading = true;
            try {
                const resp = await AM.fetch('/plugins/store/install-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url }),
                });
                if (!resp) return;
                if (!resp.ok) return this._fail('Install', resp);
                this.errorMessage = '';
                await this.load();
            } finally {
                this.loading = false;
            }
        },
    };
}
