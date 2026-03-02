// --- MAIN ENTRY POINT ---
// Wires Store → UI → PDF Renderer. Handles init, persistence, and keyboard shortcuts.

(async function main() {
    // --- 1. LOAD STATE ---
    let activeVariantId = Storage.getActiveVariantId();
    let state = null;

    // Try legacy migration first
    if (!activeVariantId) {
        const legacyId = Storage.migrateLegacy();
        if (legacyId) {
            activeVariantId = legacyId;
        }
    }

    // Load active variant
    if (activeVariantId) {
        state = Storage.loadVariant(activeVariantId);
    }

    // Try loading from default project file
    if (!state) {
        try {
            const response = await fetch('data/default_project.json');
            if (response.ok) {
                const raw = await response.json();
                state = migrateData(raw);
            }
        } catch (e) { /* fallback below */ }
    }

    // Fallback to embedded defaults
    if (!state) {
        state = createDefaultState();
    }

    // Ensure we have a variant ID
    if (!activeVariantId) {
        activeVariantId = generateUUID();
        Storage.saveVariant(activeVariantId, state.personal?.name || 'Default CV', state);
    }

    // --- 2. INIT STORE ---
    Store.init(state);

    // --- 3. INIT UI ---
    UI.initTabs();
    UI.initTheme();
    UI.initEventDelegation();
    UI.fullRender(Store.get());
    UI.renderVariants(activeVariantId);
    UI.renderSnapshots(activeVariantId);



    // --- 4. STATE CHANGE LISTENER ---
    const debouncedSave = debounce(() => {
        Storage.saveVariant(activeVariantId, _getVariantName(), Store.get());
    }, 300);

    const debouncedRender = debounce(() => {
        renderPDF(Store.get());
    }, 800);

    window.addEventListener('cv:statechange', (e) => {
        const newState = Store.get();
        UI.fullRender(newState);
        debouncedSave();
        debouncedRender();

        const sb = document.getElementById('statusBar');
        if (sb) { sb.innerText = 'Saving...'; sb.className = 'status-pill status-saving'; }
    });

    // Initial PDF render
    triggerPDFRender();

    // --- 5. IMAGE HANDLING ---
    const profileInput = document.getElementById('profileInput');
    if (profileInput) {
        profileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const buffer = await file.arrayBuffer();
                const base64 = uint8ToBase64(new Uint8Array(buffer));
                const type = file.type === 'image/png' ? 'png' : 'jpg';
                Store.setImage(base64, type, file.name);
                document.getElementById('fileLabel').innerText = file.name;
            }
        });
    }

    document.getElementById('removeImgBtn')?.addEventListener('click', () => {
        Store.removeImage();
        const profileInput = document.getElementById('profileInput');
        if (profileInput) profileInput.value = '';
    });

    // --- 6. FILE TAB ACTIONS ---
    document.getElementById('btnSaveJSON')?.addEventListener('click', () => {
        Storage.exportJSON(Store.get(), Store.get().meta?.fileName || 'cv-project');
    });

    document.getElementById('btnLoadJSON')?.addEventListener('click', () => {
        document.getElementById('loadJsonInput')?.click();
    });

    document.getElementById('loadJsonInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const imported = await Storage.importJSON(file);
            Store.init(imported);
            Storage.saveVariant(activeVariantId, _getVariantName(), imported);
            UI.fullRender(Store.get());
            triggerPDFRender();
        } catch (err) {
            alert('Import error: ' + err.message);
        }
    });

    document.getElementById('btnDownloadPDF')?.addEventListener('click', () => {
        downloadPDF(Store.get());
    });

    document.getElementById('btnATSPreview')?.addEventListener('click', () => {
        UI.showATSPreview();
    });

    document.getElementById('btnResetAll')?.addEventListener('click', async () => {
        if (confirm('Reset everything to default template?')) {
            const defaultState = createDefaultState();
            Store.init(defaultState);
            Storage.saveVariant(activeVariantId, 'Default CV', defaultState);
            UI.fullRender(Store.get());
            triggerPDFRender();
        }
    });

    // --- 7. VARIANT MANAGEMENT ---
    document.getElementById('variantSelect')?.addEventListener('change', (e) => {
        const newId = e.target.value;
        const loaded = Storage.loadVariant(newId);
        if (loaded) {
            activeVariantId = newId;
            Storage.setActiveVariantId(newId);
            Store.init(loaded);
            UI.fullRender(Store.get());
            UI.renderVariants(activeVariantId);
            UI.renderSnapshots(activeVariantId);
            triggerPDFRender();

            // Refresh AI tab for new variant
            const jdInput = document.getElementById('aiJobDescription');
            if (jdInput) jdInput.value = loaded.jobDescription || '';
            if (typeof _renderAiHistory === 'function') _renderAiHistory();
            const scores = loaded.aiMatchScores || [];
            if (scores.length > 0 && typeof _updateMatchScore === 'function') {
                _updateMatchScore(scores[scores.length - 1].score);
            } else {
                const matchBar = document.getElementById('aiMatchScoreBar');
                if (matchBar) matchBar.style.display = 'none';
            }
        }
    });

    document.getElementById('btnNewVariant')?.addEventListener('click', () => {
        const name = prompt('New variant name:', 'CV Variant');
        if (!name) return;
        const newId = generateUUID();
        const currentState = Store.get();
        Storage.saveVariant(newId, name, currentState);
        activeVariantId = newId;
        Storage.setActiveVariantId(newId);
        UI.renderVariants(activeVariantId);
    });

    document.getElementById('btnRenameVariant')?.addEventListener('click', () => {
        const name = prompt('Rename variant:', _getVariantName());
        if (!name) return;
        Storage.renameVariant(activeVariantId, name);
        UI.renderVariants(activeVariantId);
    });

    document.getElementById('btnDuplicateVariant')?.addEventListener('click', () => {
        const currentName = _getVariantName();
        const name = prompt('Name for duplicate:', currentName + ' (copy)');
        if (!name) return;
        const newId = Storage.cloneVariant(activeVariantId, name);
        if (newId) {
            activeVariantId = newId;
            Storage.setActiveVariantId(newId);
            UI.renderVariants(activeVariantId);
        }
    });

    document.getElementById('btnDeleteVariant')?.addEventListener('click', () => {
        const variants = Storage.listVariants();
        if (variants.length <= 1) {
            alert('Cannot delete the last variant.');
            return;
        }
        if (!confirm('Delete this variant?')) return;
        Storage.deleteVariant(activeVariantId);
        const remaining = Storage.listVariants();
        activeVariantId = remaining[0].id;
        Storage.setActiveVariantId(activeVariantId);
        const loaded = Storage.loadVariant(activeVariantId);
        if (loaded) {
            Store.init(loaded);
            UI.fullRender(Store.get());
            triggerPDFRender();
        }
        UI.renderVariants(activeVariantId);
    });

    // --- 8. SNAPSHOT MANAGEMENT ---
    document.getElementById('btnSnapshot')?.addEventListener('click', async () => {
        const label = document.getElementById('snapshotLabel')?.value || null;
        await Storage.snapshot(activeVariantId, Store.get(), label);
        if (document.getElementById('snapshotLabel')) document.getElementById('snapshotLabel').value = '';
        UI.renderSnapshots(activeVariantId);
    });

    document.getElementById('snapshotsList')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'restore-snapshot') {
            const restored = await Storage.restoreSnapshot(btn.dataset.snapshot);
            if (restored) {
                Store.init(restored);
                Storage.saveVariant(activeVariantId, _getVariantName(), restored);
                UI.fullRender(Store.get());
                triggerPDFRender();
            }
        }
        if (btn.dataset.action === 'delete-snapshot') {
            await Storage.deleteSnapshot(btn.dataset.snapshot);
            UI.renderSnapshots(activeVariantId);
        }
    });

    // --- 9. AI TAB ---

    // Populate model selector based on provider
    function _populateModels(providerKey) {
        const modelInput = document.getElementById('aiModel');
        const datalist = document.getElementById('aiModelSuggestions');
        if (!modelInput || !datalist) return;
        const models = AI.getProviderModels(providerKey);
        const savedModel = localStorage.getItem(`cv_ai_model_${providerKey}`);
        const defaultModel = AI.getDefaultModel(providerKey);

        datalist.innerHTML = '';
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.label = m.label;
            datalist.appendChild(opt);
        });
        modelInput.value = savedModel || defaultModel;
    }

    // Restore saved provider and populate models
    const savedProvider = localStorage.getItem('cv_ai_provider') || 'openai';
    const providerSelect = document.getElementById('aiProvider');
    if (providerSelect) providerSelect.value = savedProvider;
    _populateModels(savedProvider);

    // Load saved API key for this provider
    const savedApiKey = localStorage.getItem(`cv_ai_key_${savedProvider}`) || localStorage.getItem('cv_ai_key');
    if (savedApiKey) {
        const keyInput = document.getElementById('aiApiKey');
        if (keyInput) keyInput.value = savedApiKey;
    }

    // --- LIVE COST ESTIMATE ---
    function _updateEstimate() {
        const el = document.getElementById('aiEstimateText');
        if (!el) return;

        const jd = document.getElementById('aiJobDescription')?.value || '';
        const cvText = Store.get().personal?.name || '';  // lightweight check
        const provider = document.getElementById('aiProvider')?.value || 'openai';
        const model = document.getElementById('aiModel')?.value || AI.getDefaultModel(provider);
        const pricing = AI.getModelPricing(model);

        if (!jd.trim()) {
            el.innerHTML = 'Paste a job description to see cost estimate';
            return;
        }

        // Build a rough prompt to estimate (CV text + JD + system prompt overhead)
        const roughPrompt = jd + ' '.repeat(500); // ~500 chars for system prompt + CV
        const preview = AI.previewCost(roughPrompt);

        if (!pricing) {
            el.innerHTML = `<span class="est-tokens">~${AI.formatTokens(preview.inputTokens)} input tokens</span> · pricing unknown for ${model}`;
        } else if (preview.isFree) {
            el.innerHTML = `<span class="est-tokens">~${AI.formatTokens(preview.inputTokens)} input tokens</span> · <span class="est-free">Free (no cost)</span>`;
        } else {
            el.innerHTML = `<span class="est-tokens">~${AI.formatTokens(preview.inputTokens)} input tokens</span> · <span class="est-cost">≈ ${AI.formatCost(preview.cost)} per call</span>`;
        }
    }

    const _debouncedEstimate = debounce(_updateEstimate, 300);

    // Provider change → repopulate models + swap API key + update estimate
    document.getElementById('aiProvider')?.addEventListener('change', (e) => {
        const provider = e.target.value;
        localStorage.setItem('cv_ai_provider', provider);
        _populateModels(provider);

        // Swap to saved key for this provider
        const keyInput = document.getElementById('aiApiKey');
        if (keyInput) keyInput.value = localStorage.getItem(`cv_ai_key_${provider}`) || '';
        _updateEstimate();
    });

    // Model change → save preference + update estimate
    document.getElementById('aiModel')?.addEventListener('input', (e) => {
        const provider = document.getElementById('aiProvider')?.value || 'openai';
        localStorage.setItem(`cv_ai_model_${provider}`, e.target.value);
        _updateEstimate();
    });

    // Job description change → update estimate + persist
    const _debouncedJdSave = debounce(() => {
        Store.setJobDescription(document.getElementById('aiJobDescription')?.value || '');
    }, 500);
    document.getElementById('aiJobDescription')?.addEventListener('input', (e) => {
        _debouncedEstimate();
        _debouncedJdSave();
    });

    // API key change → save per provider
    document.getElementById('aiApiKey')?.addEventListener('change', (e) => {
        const provider = document.getElementById('aiProvider')?.value || 'openai';
        localStorage.setItem(`cv_ai_key_${provider}`, e.target.value);
        AI.saveApiKey(e.target.value);
    });

    // Token/cost usage display
    window.addEventListener('cv:ai-usage', (e) => {
        const info = e.detail;
        const costBar = document.getElementById('aiCostBar');
        if (!costBar) return;
        costBar.style.display = 'flex';
        document.getElementById('aiLastModel').innerHTML =
            `<span class="cost-label">${info.model}</span>`;
        document.getElementById('aiLastTokens').innerHTML =
            `📥 ${AI.formatTokens(info.inputTokens)} in · 📤 ${AI.formatTokens(info.outputTokens)} out` +
            (info.estimated ? ' <small>(est.)</small>' : '');
        document.getElementById('aiLastCost').innerHTML =
            `💰 ${AI.formatCost(info.cost)}`;
        const session = AI.getSession();
        document.getElementById('aiSessionTokens').innerText =
            AI.formatTokens(session.totalInputTokens + session.totalOutputTokens);
        document.getElementById('aiSessionCost').innerText =
            AI.formatCost(session.totalCost);
        document.getElementById('aiSessionCalls').innerText = session.calls;
    });

    document.getElementById('aiResetSession')?.addEventListener('click', () => {
        AI.resetSession();
        document.getElementById('aiSessionTokens').innerText = '0';
        document.getElementById('aiSessionCost').innerText = 'Free';
        document.getElementById('aiSessionCalls').innerText = '0';
        document.getElementById('aiCostBar').style.display = 'none';
    });

    // --- HELPER: find first Tags section ---
    function _findTagsSection() {
        const state = Store.get();
        return state.sections.find(s => s.type === SECTION_TYPES.TAGS);
    }

    // --- HELPER: render keyword results with action buttons ---
    function _renderKeywordResults(result, jd) {
        const resultsDiv = document.getElementById('aiResults');
        const score = AI.getMatchScore(result);
        const tagsSec = _findTagsSection();

        let html = '<h4>Keyword Gap Analysis</h4><div class="keyword-chips">';
        (result.present || []).forEach(k => {
            html += `<span class="keyword-chip present">✅ ${k}</span>`;
        });
        (result.missing || []).forEach(k => {
            html += `<span class="keyword-chip missing">❌ ${k}`;
            if (tagsSec) {
                html += `<button class="btn-add-skill" data-keyword="${k.replace(/"/g, '&quot;')}" data-section="${tagsSec.id}" title="Add to ${tagsSec.title}">+ Add</button>`;
            }
            html += `</span>`;
        });
        html += '</div>';
        html += `<p style="color:#ccc;font-size:0.9rem;">Match score: <strong>${score}%</strong> (${result.present?.length || 0}/${(result.present?.length || 0) + (result.missing?.length || 0)} keywords found)</p>`;

        if (tagsSec && result.missing?.length > 0) {
            html += `<button class="btn-action btn-sm" id="aiAddAllMissing" style="margin-top:6px;">⊕ Add All Missing to ${tagsSec.title}</button>`;
        }

        resultsDiv.innerHTML = html;

        // Wire "Add" buttons
        resultsDiv.querySelectorAll('.btn-add-skill').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const keyword = e.target.dataset.keyword;
                const sectionId = e.target.dataset.section;
                Store.addTagToSection(sectionId, keyword);
                e.target.textContent = '✓';
                e.target.disabled = true;
                e.target.style.borderColor = '#98c379';
            });
        });

        // Wire "Add All Missing"
        document.getElementById('aiAddAllMissing')?.addEventListener('click', () => {
            if (!tagsSec) return;
            const added = Store.addTagsToSection(tagsSec.id, result.missing);
            document.getElementById('aiAddAllMissing').textContent = `✓ Added ${added} keywords`;
            document.getElementById('aiAddAllMissing').disabled = true;
            // Disable individual buttons
            resultsDiv.querySelectorAll('.btn-add-skill').forEach(btn => {
                btn.textContent = '✓';
                btn.disabled = true;
            });
        });

        // Update match score bar
        _updateMatchScore(score);
        Store.addMatchScore(score, AI.getLastCallInfo()?.model || '');
    }

    // --- HELPER: update match score UI ---
    function _updateMatchScore(score) {
        const bar = document.getElementById('aiMatchScoreBar');
        if (!bar) return;
        bar.style.display = 'block';

        document.getElementById('aiMatchScoreValue').innerText = score + '%';
        const fill = document.getElementById('aiMatchScoreFill');
        fill.style.width = score + '%';

        // Color based on score
        if (score < 40) fill.style.background = '#e06c75';
        else if (score < 70) fill.style.background = '#d19a66';
        else fill.style.background = '#98c379';

        // Update dots from history
        const scores = Store.get().aiMatchScores || [];
        const dotsEl = document.getElementById('aiMatchScoreDots');
        dotsEl.innerHTML = '';
        scores.forEach((s, i) => {
            const dot = document.createElement('div');
            dot.className = 'match-score-dot' + (i === scores.length - 1 ? ' latest' : '');
            dot.style.height = Math.max(3, s.score / 5) + 'px';
            dot.title = `${s.score}% — ${new Date(s.timestamp).toLocaleDateString()}`;
            dotsEl.appendChild(dot);
        });
    }

    // --- HELPER: render AI history panel ---
    function _renderAiHistory() {
        const panel = document.getElementById('aiHistoryPanel');
        const countEl = document.getElementById('aiHistoryCount');
        const history = Store.get().aiHistory || [];

        countEl.innerText = history.length;
        if (history.length === 0) {
            panel.innerHTML = '<p style="color:#666;font-size:0.8rem;">No AI results saved yet.</p>';
            return;
        }

        panel.innerHTML = history.map(entry => {
            const time = new Date(entry.timestamp).toLocaleString();
            const typeLabel = entry.type === 'keywords' ? '🔍 Keywords' :
                entry.type === 'rewrite' ? '✍️ Rewrite' :
                    entry.type === 'cliches' ? '🚫 Clichés' : entry.type;
            const badgeClass = entry.type + (entry.applied ? ' applied' : '');
            const costStr = entry.usage ? AI.formatCost(entry.usage.cost) : '';

            return `
                <div class="ai-history-item" data-entry-id="${entry.id}">
                    <div class="ai-history-item-header">
                        <span class="type-badge ${badgeClass}">${typeLabel}${entry.applied ? ' ✓' : ''}</span>
                        <span style="color:#666;font-size:0.7rem;">${time}</span>
                    </div>
                    <div class="meta-row">
                        <span>${entry.model || 'unknown'}</span>
                        <span>${costStr}</span>
                    </div>
                    ${entry.jobSnippet ? `<div class="snippet">"${entry.jobSnippet}…"</div>` : ''}
                    <div class="actions-row">
                        <button class="btn-action btn-sm" data-action="restore-ai-result" data-entry="${entry.id}">👁 View</button>
                        <button class="btn-action btn-sm btn-danger" data-action="delete-ai-result" data-entry="${entry.id}">✕</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- KEYWORD ANALYSIS ---
    async function _runKeywordAnalysis(jd) {
        const resultsDiv = document.getElementById('aiResults');
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '<p style="color:#888;">Analyzing...</p>';
        try {
            const result = await AI.analyzeKeywords(Store.get(), jd);
            _renderKeywordResults(result, jd);

            // Save to history
            const entry = AI.buildResultEntry('keywords', result, jd);
            Store.addAiResult(entry);
            _renderAiHistory();
        } catch (err) {
            resultsDiv.innerHTML = `<p style="color:#e06c75;">${err.message}</p>`;
        }
    }

    document.getElementById('aiAnalyze')?.addEventListener('click', () => {
        const jd = document.getElementById('aiJobDescription')?.value || '';
        _runKeywordAnalysis(jd);
    });

    // --- RE-SCAN (uses saved JD) ---
    document.getElementById('aiRescan')?.addEventListener('click', () => {
        const jd = document.getElementById('aiJobDescription')?.value || Store.get().jobDescription || '';
        if (!jd.trim()) {
            const resultsDiv = document.getElementById('aiResults');
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<p style="color:#e06c75;">No job description saved. Paste one first.</p>';
            return;
        }
        _runKeywordAnalysis(jd);
    });

    // --- SUMMARY REWRITE ---
    document.getElementById('aiRewriteSummary')?.addEventListener('click', async () => {
        const resultsDiv = document.getElementById('aiResults');
        const jd = document.getElementById('aiJobDescription')?.value || '';
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '<p style="color:#888;">Rewriting summary...</p>';
        try {
            const suggested = await AI.rewriteSummary(Store.get(), jd);
            const state = Store.get();
            const summarySection = state.sections.find(s =>
                s.type === SECTION_TYPES.TEXT && s.title.toLowerCase().includes('summary')
            );
            const original = summarySection?.content || '(no summary)';

            // Save to history
            const entry = AI.buildResultEntry('rewrite', { original, suggested }, jd);
            Store.addAiResult(entry);
            _renderAiHistory();

            resultsDiv.innerHTML = `
                <h4>Summary Rewrite Suggestion</h4>
                <div class="ai-suggestion">
                    <div class="original"><strong>Current:</strong> ${original}</div>
                    <div class="suggested"><strong>Suggested:</strong> ${suggested}</div>
                    <div class="ai-actions-row">
                        <button class="btn-accept" id="aiAcceptSummary">✅ Accept</button>
                        <button class="btn-skip" id="aiSkipSummary">Skip</button>
                    </div>
                </div>
            `;

            document.getElementById('aiAcceptSummary')?.addEventListener('click', () => {
                if (summarySection) {
                    Store.updateSection(summarySection.id, { content: suggested });
                    Store.markAiResultApplied(entry.id);
                    resultsDiv.innerHTML = '<p style="color:#98c379;">Summary updated!</p>';
                    _renderAiHistory();
                }
            });
            document.getElementById('aiSkipSummary')?.addEventListener('click', () => {
                resultsDiv.style.display = 'none';
            });
        } catch (err) {
            resultsDiv.innerHTML = `<p style="color:#e06c75;">${err.message}</p>`;
        }
    });

    // --- CLICHÉ CHECK ---
    document.getElementById('aiCheckCliches')?.addEventListener('click', () => {
        const resultsDiv = document.getElementById('aiResults');
        resultsDiv.style.display = 'block';
        const cliches = AI.checkCliches(Store.get());
        if (cliches.length === 0) {
            resultsDiv.innerHTML = '<h4>Cliché Check</h4><p style="color:#98c379;">No clichés detected! Your language is strong. 💪</p>';
        } else {
            let html = '<h4>Cliché Check</h4><p style="color:#888;font-size:0.85rem;">These commonly overused phrases were found:</p><ul class="cliche-list">';
            cliches.forEach(c => html += `<li>${c}</li>`);
            html += '</ul>';
            resultsDiv.innerHTML = html;
        }
    });

    // --- AI HISTORY ACTIONS ---
    document.getElementById('aiHistoryPanel')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        if (btn.dataset.action === 'restore-ai-result') {
            const history = Store.get().aiHistory || [];
            const entry = history.find(h => h.id === btn.dataset.entry);
            if (!entry) return;

            const resultsDiv = document.getElementById('aiResults');
            resultsDiv.style.display = 'block';

            if (entry.type === 'keywords' && entry.result) {
                _renderKeywordResults(entry.result, entry.jobSnippet);
            } else if (entry.type === 'rewrite' && entry.result) {
                resultsDiv.innerHTML = `
                    <h4>Summary Rewrite (from history)</h4>
                    <div class="ai-suggestion">
                        <div class="original"><strong>Original:</strong> ${entry.result.original}</div>
                        <div class="suggested"><strong>Suggested:</strong> ${entry.result.suggested}</div>
                    </div>
                `;
            }
        }

        if (btn.dataset.action === 'delete-ai-result') {
            Store.removeAiResult(btn.dataset.entry);
            _renderAiHistory();
        }
    });

    document.getElementById('aiClearHistory')?.addEventListener('click', () => {
        Store.clearAiHistory();
        _renderAiHistory();
        document.getElementById('aiMatchScoreBar').style.display = 'none';
    });

    // Initial render of history + match scores + load saved JD
    _renderAiHistory();
    const savedJd = Store.get().jobDescription || '';
    if (savedJd) {
        const jdInput = document.getElementById('aiJobDescription');
        if (jdInput) jdInput.value = savedJd;
    }
    const lastScores = Store.get().aiMatchScores || [];
    if (lastScores.length > 0) {
        _updateMatchScore(lastScores[lastScores.length - 1].score);
    }

    // --- 10. KEYBOARD SHORTCUTS ---
    Keyboard.register('s', ['ctrl', 'shift'], () => {
        Storage.saveVariant(activeVariantId, _getVariantName(), Store.get());
        const sb = document.getElementById('statusBar');
        if (sb) { sb.innerText = 'Saved'; sb.className = 'status-pill status-ready'; }
    }, 'Save project');

    Keyboard.register('z', ['ctrl'], () => {
        if (Store.undo()) {
            UI.fullRender(Store.get());
            debouncedRender();
        }
    }, 'Undo');

    Keyboard.register('y', ['ctrl'], () => {
        if (Store.redo()) {
            UI.fullRender(Store.get());
            debouncedRender();
        }
    }, 'Redo');

    Keyboard.register('z', ['ctrl', 'shift'], () => {
        if (Store.redo()) {
            UI.fullRender(Store.get());
            debouncedRender();
        }
    }, 'Redo (alt)');

    Keyboard.register('p', ['ctrl', 'shift'], () => {
        downloadPDF(Store.get());
    }, 'Download PDF');

    Keyboard.init();

    // --- HELPERS ---
    function _getVariantName() {
        const variants = Storage.listVariants();
        const v = variants.find(v => v.id === activeVariantId);
        return v?.name || Store.get().personal?.name || 'Untitled';
    }
})();
