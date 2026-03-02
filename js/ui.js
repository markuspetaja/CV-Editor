// --- UI RENDERER ---
// Renders state → DOM. Subscribes to cv:statechange.
// Uses event delegation — no inline handlers.

const UI = (() => {
    let _lastRenderedSections = [];

    // --- TAB SWITCHING ---
    function initTabs() {
        document.getElementById('tabBar').addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-btn');
            if (!btn) return;
            const tabId = btn.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
            btn.classList.add('active');
        });
    }

    // --- THEME ---
    function initTheme() {
        document.getElementById('themeToggle').addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-mode');
            localStorage.setItem('cv_theme_light', isLight);
            document.getElementById('themeToggle').innerText = isLight ? '🌙' : '☀';
        });
        if (localStorage.getItem('cv_theme_light') === 'true') {
            document.body.classList.add('light-mode');
            document.getElementById('themeToggle').innerText = '🌙';
        }

        document.getElementById('dimmerToggle').addEventListener('click', () => {
            const pane = document.getElementById('previewPane');
            const isDimmed = pane.classList.toggle('dimmed');
            localStorage.setItem('cv_dimmer', isDimmed);
        });
        if (localStorage.getItem('cv_dimmer') === 'true') {
            document.getElementById('previewPane').classList.add('dimmed');
        }
    }

    // --- PERSONAL INFO RENDERING ---
    function renderPersonalInfo(state) {
        document.getElementById('name').value = state.personal.name || '';

        ['titles', 'contacts', 'links'].forEach(field => {
            const container = document.getElementById(`${field}-container`);
            if (!container) return;
            // Keyed diff: only add/remove items that changed
            const current = container.querySelectorAll('.pi-item');
            const values = state.personal[field] || [];

            // If count matches and values match, skip
            if (current.length === values.length) {
                let same = true;
                current.forEach((item, i) => {
                    if (item.querySelector('input').value !== values[i]) same = false;
                });
                if (same) return;
            }

            container.innerHTML = '';
            values.forEach((val, idx) => {
                container.appendChild(_createPersonalItemEl(field, idx, val));
            });
        });

        // Image
        _renderImageState(state);
    }

    function _createPersonalItemEl(field, index, value) {
        const div = document.createElement('div');
        div.className = 'pi-item';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'pi-val';
        input.value = value;
        input.placeholder = field === 'titles' ? 'Job Title' : field === 'contacts' ? 'Contact' : 'Link';
        input.dataset.field = field;
        input.dataset.index = index;
        input.style.flex = '1';

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-remove-tiny';
        delBtn.innerText = '-';
        delBtn.title = 'Remove';
        delBtn.dataset.action = 'remove-personal';
        delBtn.dataset.field = field;
        delBtn.dataset.index = index;

        div.appendChild(input);
        div.appendChild(delBtn);
        return div;
    }

    function _renderImageState(state) {
        const removeBtn = document.getElementById('removeImgBtn');
        const fileLabel = document.getElementById('fileLabel');
        if (state.image) {
            if (removeBtn) removeBtn.style.display = 'inline-block';
            if (fileLabel) fileLabel.innerText = 'Photo: ' + (state.image.name || 'profile');
        } else {
            if (removeBtn) removeBtn.style.display = 'none';
            if (fileLabel) fileLabel.innerText = '＋ Add Photo';
        }
    }

    // --- SECTION RENDERING ---

    function renderSections(state) {
        const container = document.getElementById('sections-container');
        if (!container) return;

        const sections = state.sections || [];
        const existingCards = container.querySelectorAll('.section-card');
        const existingIds = new Map();
        existingCards.forEach(card => existingIds.set(card.dataset.id, card));

        const newIds = new Set(sections.map(s => s.id));

        // Remove deleted
        existingIds.forEach((card, id) => {
            if (!newIds.has(id)) card.remove();
        });

        // Add/reorder
        sections.forEach((sec, i) => {
            let card = existingIds.get(sec.id);
            if (!card) {
                card = _createSectionCard(sec);
                container.appendChild(card);
            } else {
                _updateSectionCard(card, sec);
            }
            // Ensure order
            if (container.children[i] !== card) {
                container.insertBefore(card, container.children[i]);
            }
        });

        _lastRenderedSections = sections.map(s => s.id);
    }

    function _createSectionCard(sec) {
        const card = document.createElement('div');
        card.className = 'section-card section-drag-box';
        card.dataset.id = sec.id;
        card.dataset.type = sec.type;
        card.setAttribute('draggable', 'false');

        card.addEventListener('mousedown', function (e) {
            if (e.target.classList.contains('section-drag-handle')) {
                this.setAttribute('draggable', 'true');
            } else {
                this.setAttribute('draggable', 'false');
            }
        });
        card.addEventListener('dragstart', _handleDragStart);
        card.addEventListener('dragend', _handleDragEnd);
        card.addEventListener('dragover', _handleDragOver);
        card.addEventListener('dragenter', _handleDragEnter);
        card.addEventListener('dragleave', _handleDragLeave);
        card.addEventListener('drop', _handleDrop);

        _fillSectionCard(card, sec);
        return card;
    }

    function _fillSectionCard(card, sec) {
        const checked = sec.isVisible !== false ? 'checked' : '';
        const badgeLabel = sec.type.toUpperCase();

        let bodyHTML = '';
        if (sec.type === SECTION_TYPES.TEXT) {
            bodyHTML = _renderTextBody(sec);
        } else if (sec.type === SECTION_TYPES.TAGS) {
            bodyHTML = _renderTagsBody(sec);
        } else if (sec.type === SECTION_TYPES.TABLE) {
            bodyHTML = _renderTableBody(sec);
        } else if (sec.type === SECTION_TYPES.ACHIEVEMENTS) {
            bodyHTML = _renderAchievementsBody(sec);
        } else if (sec.type === SECTION_TYPES.CONDENSED) {
            bodyHTML = _renderCondensedBody(sec);
        } else {
            bodyHTML = _renderListBody(sec);
        }

        card.innerHTML = `
        <details open>
            <summary class="section-summary">
                <span class="section-drag-handle" title="Drag to reorder">⋮⋮</span>
                <div class="section-title-group">
                    <span class="collapse-arrow">▶</span>
                    <input type="text" class="section-header-input" value="${_escapeAttr(sec.title)}" placeholder="Section Title" data-action="update-section-title" data-section="${sec.id}" onclick="event.stopPropagation()" />
                </div>
                <div class="section-controls">
                    <span class="badge">${badgeLabel}</span>
                    <label class="switch" onclick="event.stopPropagation()" title="Toggle Visibility">
                        <input type="checkbox" class="section-toggle-input" ${checked} data-action="toggle-section" data-section="${sec.id}">
                        <span class="slider"></span>
                    </label>
                    <button class="btn-remove-tiny" data-action="duplicate-section" data-section="${sec.id}" title="Duplicate" style="color:#61afef;border-color:#444;">⊕</button>
                    <button class="btn-remove-tiny" data-action="remove-section" data-section="${sec.id}" title="Remove">-</button>
                </div>
            </summary>
            <div class="section-body">
                <div class="section-options">
                    <label>Spacing:</label>
                    <select data-action="update-section-spacing" data-section="${sec.id}">
                        <option value="tight" ${sec.spacing === 'tight' ? 'selected' : ''}>Tight</option>
                        <option value="normal" ${sec.spacing === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="loose" ${sec.spacing === 'loose' ? 'selected' : ''}>Loose</option>
                    </select>
                    <label>Color:</label>
                    <input type="color" value="${sec.color || '#005371'}" data-action="update-section-color" data-section="${sec.id}" title="Section header color override" />
                </div>
                ${bodyHTML}
            </div>
        </details>
        `;
    }

    function _updateSectionCard(card, sec) {
        // Full rebuild if type changed
        if (card.dataset.type !== sec.type) {
            card.dataset.type = sec.type;
            _fillSectionCard(card, sec);
            return;
        }

        // Update title if not focused
        const titleInput = card.querySelector('.section-header-input');
        if (titleInput && document.activeElement !== titleInput) {
            titleInput.value = sec.title;
        }

        // Update visibility toggle
        const toggle = card.querySelector('.section-toggle-input');
        if (toggle) toggle.checked = sec.isVisible !== false;

        // Re-render body content (items/text) — skip if user is typing inside the body
        const bodyEl = card.querySelector('.section-body');
        if (bodyEl) {
            const activeEl = document.activeElement;
            const activeInBody = bodyEl.contains(activeEl);
            let activeItemId = null, activeField = null, activeSelStart = null, activeSelEnd = null;

            if (activeInBody && activeEl.dataset) {
                activeItemId = activeEl.dataset.item || null;
                activeField = activeEl.dataset.field || null;
                activeSelStart = activeEl.selectionStart;
                activeSelEnd = activeEl.selectionEnd;
            }

            let bodyHTML = '';
            if (sec.type === SECTION_TYPES.TEXT) {
                bodyHTML = _renderTextBody(sec);
            } else if (sec.type === SECTION_TYPES.TAGS) {
                bodyHTML = _renderTagsBody(sec);
            } else if (sec.type === SECTION_TYPES.TABLE) {
                bodyHTML = _renderTableBody(sec);
            } else if (sec.type === SECTION_TYPES.ACHIEVEMENTS) {
                bodyHTML = _renderAchievementsBody(sec);
            } else if (sec.type === SECTION_TYPES.CONDENSED) {
                bodyHTML = _renderCondensedBody(sec);
            } else {
                bodyHTML = _renderListBody(sec);
            }

            // Rebuild the body content while keeping the section-options row
            const optionsEl = bodyEl.querySelector('.section-options');
            if (optionsEl) {
                // Ensure current values are reflected in the HTML string before copying
                const select = optionsEl.querySelector('select[data-action="update-section-spacing"]');
                if (select) {
                    Array.from(select.options).forEach(opt => {
                        if (opt.value === select.value) opt.setAttribute('selected', 'selected');
                        else opt.removeAttribute('selected');
                    });
                }
                const colorInput = optionsEl.querySelector('input[type="color"]');
                if (colorInput) {
                    colorInput.setAttribute('value', colorInput.value);
                }
            }
            const optionsHTML = optionsEl ? optionsEl.outerHTML : '';
            bodyEl.innerHTML = optionsHTML + bodyHTML;

            // Restore focus if the user was typing in a field
            if (activeInBody && activeItemId && activeField) {
                const target = bodyEl.querySelector(`[data-item="${activeItemId}"][data-field="${activeField}"]`);
                if (target) {
                    target.focus();
                    if (typeof target.setSelectionRange === 'function' && activeSelStart !== null) {
                        target.setSelectionRange(activeSelStart, activeSelEnd);
                    }
                }
            } else if (activeInBody && activeEl.dataset?.action === 'update-section-content') {
                // Text section textarea
                const ta = bodyEl.querySelector('[data-action="update-section-content"]');
                if (ta) {
                    ta.focus();
                    if (activeSelStart !== null) ta.setSelectionRange(activeSelStart, activeSelEnd);
                }
            }
        }
    }

    // --- SECTION BODY RENDERERS ---

    function _renderTextBody(sec) {
        return `<textarea class="desc auto-grow" data-action="update-section-content" data-section="${sec.id}" placeholder="Text content...">${_escapeHTML(sec.content || '')}</textarea>`;
    }

    function _renderListBody(sec) {
        const items = sec.items || [];
        let html = '<div class="items-container">';
        items.forEach((item, idx) => {
            html += _renderListItemHTML(sec.id, item, idx);
        });
        html += '</div>';
        html += `<div class="btn-skeleton" data-action="add-item" data-section="${sec.id}">＋ Add Item</div>`;
        return html;
    }

    function _renderListItemHTML(sectionId, item, index) {
        return `
        <div class="card-box" data-item-id="${item.id}" data-section="${sectionId}"
             onmousedown="if(event.target.classList.contains('drag-handle')){this.setAttribute('draggable','true')}else{this.setAttribute('draggable','false')}"
             ondragstart="UI._handleDragStart(event)" ondragend="UI._handleDragEnd(event)"
             ondragover="UI._handleDragOver(event)" ondragenter="UI._handleDragEnter(event)"
             ondragleave="UI._handleDragLeave(event)" ondrop="UI._handleDrop(event)">
            <div class="item-row-top card-header-row">
                <span class="drag-handle">⋮⋮</span>
                <input type="text" class="l1" placeholder="What" value="${_escapeAttr(item.l1 || '')}" data-action="update-item" data-section="${sectionId}" data-item="${item.id}" data-field="l1">
                <div class="date-group">
                    <input type="text" class="date-start" placeholder="When" value="${_escapeAttr(item.l2 || '')}" data-action="update-item" data-section="${sectionId}" data-item="${item.id}" data-field="l2">
                </div>
                <button class="btn-remove-tiny" data-action="duplicate-item" data-section="${sectionId}" data-item="${item.id}" title="Duplicate" style="color:#61afef;border-color:#444;">⊕</button>
                <button class="btn-remove-tiny" data-action="remove-item" data-section="${sectionId}" data-item="${item.id}" title="Remove">-</button>
            </div>
            <div class="item-row-sub card-header-row">
                <input type="text" class="l3" placeholder="Where" value="${_escapeAttr(item.l3 || '')}" data-action="update-item" data-section="${sectionId}" data-item="${item.id}" data-field="l3">
            </div>
            <textarea class="desc auto-grow" placeholder="Description" data-action="update-item" data-section="${sectionId}" data-item="${item.id}" data-field="desc">${_escapeHTML(item.desc || '')}</textarea>
        </div>`;
    }

    function _renderCondensedBody(sec) {
        const items = sec.items || [];
        let html = '<div class="condensed-list">';
        items.forEach((item) => {
            html += `
            <div class="condensed-row" data-item-id="${item.id}">
                <span class="drag-handle condensed-drag">⋮⋮</span>
                <input type="text" class="condensed-l1" placeholder="Role / Title"
                    value="${_escapeAttr(item.l1 || '')}"
                    data-action="update-item" data-section="${sec.id}" data-item="${item.id}" data-field="l1">
                <span class="condensed-sep">·</span>
                <input type="text" class="condensed-l3" placeholder="Organization"
                    value="${_escapeAttr(item.l3 || '')}"
                    data-action="update-item" data-section="${sec.id}" data-item="${item.id}" data-field="l3">
                <span class="condensed-sep">·</span>
                <input type="text" class="condensed-l2" placeholder="Year"
                    value="${_escapeAttr(item.l2 || '')}"
                    data-action="update-item" data-section="${sec.id}" data-item="${item.id}" data-field="l2">
                <button class="btn-remove-tiny" data-action="remove-item" data-section="${sec.id}" data-item="${item.id}" title="Remove">-</button>
            </div>`;
        });
        html += '</div>';
        html += `<div class="btn-skeleton" data-action="add-item" data-section="${sec.id}">＋ Add Entry</div>`;
        return html;
    }

    function _renderTagsBody(sec) {
        const items = sec.items || [];
        let html = '<div class="tags-container">';
        items.forEach(item => {
            html += `
            <div class="tag-pill" data-item-id="${item.id}">
                <input type="text" value="${_escapeAttr(item.tag || '')}" placeholder="Tag" data-action="update-item" data-section="${sec.id}" data-item="${item.id}" data-field="tag" />
                <button class="btn-remove-tiny" data-action="remove-item" data-section="${sec.id}" data-item="${item.id}" title="Remove">×</button>
            </div>`;
        });
        html += '</div>';
        html += `<div class="btn-skeleton" data-action="add-item" data-section="${sec.id}">＋ Add Tag</div>`;
        return html;
    }

    function _renderTableBody(sec) {
        const items = sec.items || [];
        let html = '<div class="table-rows-container">';
        items.forEach(item => {
            html += `
            <div class="table-row" data-item-id="${item.id}">
                <input type="text" class="table-key" placeholder="Key" value="${_escapeAttr(item.key || '')}" data-action="update-item" data-section="${sec.id}" data-item="${item.id}" data-field="key" />
                <input type="text" class="table-value" placeholder="Value" value="${_escapeAttr(item.value || '')}" data-action="update-item" data-section="${sec.id}" data-item="${item.id}" data-field="value" />
                <button class="btn-remove-tiny" data-action="remove-item" data-section="${sec.id}" data-item="${item.id}" title="Remove">-</button>
            </div>`;
        });
        html += '</div>';
        html += `<div class="btn-skeleton" data-action="add-item" data-section="${sec.id}">＋ Add Row</div>`;
        return html;
    }

    function _renderAchievementsBody(sec) {
        const items = sec.items || [];
        let html = '<div class="achievements-container">';
        items.forEach((item, idx) => {
            html += `
            <div class="achievement-row" data-item-id="${item.id}">
                <div class="achievement-num">${idx + 1}</div>
                <textarea class="desc auto-grow" placeholder="Achievement (numbers auto-bolded in PDF)" data-action="update-item" data-section="${sec.id}" data-item="${item.id}" data-field="desc">${_escapeHTML(item.desc || '')}</textarea>
                <button class="btn-remove-tiny" data-action="remove-item" data-section="${sec.id}" data-item="${item.id}" title="Remove">-</button>
            </div>`;
        });
        html += '</div>';
        html += `<div class="btn-skeleton" data-action="add-item" data-section="${sec.id}">＋ Add Achievement</div>`;
        return html;
    }

    // --- DESIGN TAB RENDERING ---

    function renderDesign(state) {
        _setValIfNotFocused('fontSelection', state.font);
        _setValIfNotFocused('sizeScale', state.sizeScale);
        _setValIfNotFocused('pageSize', state.pageSize);
        _setValIfNotFocused('margins', state.margins);
        _setValIfNotFocused('dividerStyle', state.dividerStyle);
        _setValIfNotFocused('photoShape', state.photoShape || 'none');

        if (state.colors) {
            _setValIfNotFocused('col-name', state.colors.name);
            _setValIfNotFocused('col-header', state.colors.header);
            _setValIfNotFocused('col-role', state.colors.role);
            _setValIfNotFocused('col-body', state.colors.body);
            _setValIfNotFocused('col-accent', state.colors.accent);
        }
    }

    // --- META RENDERING ---

    function renderMeta(state) {
        if (state.meta) {
            _setValIfNotFocused('metaFileName', state.meta.fileName);
            _setValIfNotFocused('metaTitle', state.meta.title);
            _setValIfNotFocused('metaAuthor', state.meta.author);
            _setValIfNotFocused('metaSubject', state.meta.subject);
            _setValIfNotFocused('metaKeywords', state.meta.keywords);
            _setValIfNotFocused('metaCreator', state.meta.creator);
            _setValIfNotFocused('metaProducer', state.meta.producer);
            _setValIfNotFocused('metaLang', state.meta.lang);
        }
    }

    // --- FULL RENDER (called on init and on undo/redo) ---

    function fullRender(state) {
        renderPersonalInfo(state);
        renderSections(state);
        renderDesign(state);
        renderMeta(state);

        // Auto-grow all textareas
        requestAnimationFrame(() => {
            document.querySelectorAll('textarea.auto-grow').forEach(ta => _autoGrow(ta));
        });
    }

    // --- EVENT DELEGATION ---

    function initEventDelegation() {
        const editor = document.querySelector('.editor-scroll');
        if (!editor) return;

        // INPUT events (text changes)
        editor.addEventListener('input', (e) => {
            const el = e.target;
            const action = el.dataset.action;

            if (el.id === 'name') {
                Store.updatePersonal({ name: el.value });
                return;
            }

            // Personal item input
            if (el.classList.contains('pi-val')) {
                const field = el.dataset.field;
                const index = parseInt(el.dataset.index, 10);
                Store.updatePersonalItem(field, index, el.value);
                return;
            }

            // Section title
            if (action === 'update-section-title') {
                Store.updateSection(el.dataset.section, { title: el.value });
                return;
            }

            // Section content (text type)
            if (action === 'update-section-content') {
                _autoGrow(el);
                Store.updateSection(el.dataset.section, { content: el.value });
                return;
            }

            // Item field update
            if (action === 'update-item') {
                if (el.tagName === 'TEXTAREA') _autoGrow(el);
                Store.updateItem(el.dataset.section, el.dataset.item, { [el.dataset.field]: el.value });
                return;
            }

            // Meta fields
            if (el.id && el.id.startsWith('meta')) {
                const key = el.id.replace('meta', '');
                const metaKey = key.charAt(0).toLowerCase() + key.slice(1);
                Store.updateMeta({ [metaKey]: el.value });
                return;
            }

            // Design fields
            if (['fontSelection', 'sizeScale', 'pageSize', 'margins', 'dividerStyle', 'photoShape'].includes(el.id)) {
                Store.updateSetting(el.id === 'fontSelection' ? 'font' : el.id, el.value);
                return;
            }

            // Color pickers
            if (el.id && el.id.startsWith('col-')) {
                const colorKey = el.id.replace('col-', '');
                Store.updateColors({ [colorKey]: el.value });
                document.getElementById('paletteSelect').value = 'custom';
                return;
            }

            // Section spacing
            if (action === 'update-section-spacing') {
                Store.updateSection(el.dataset.section, { spacing: el.value });
                return;
            }

            // Section color
            if (action === 'update-section-color') {
                Store.updateSection(el.dataset.section, { color: el.value });
                return;
            }
        });

        // CHANGE events (selects, toggles)
        editor.addEventListener('change', (e) => {
            const el = e.target;
            const action = el.dataset.action;

            if (action === 'toggle-section') {
                Store.updateSection(el.dataset.section, { isVisible: el.checked });
                return;
            }

            // Design selects
            if (['fontSelection', 'sizeScale', 'pageSize', 'margins', 'dividerStyle', 'photoShape'].includes(el.id)) {
                Store.updateSetting(el.id === 'fontSelection' ? 'font' : el.id, el.value);
                return;
            }

            // Palette preset
            if (el.id === 'paletteSelect') {
                const val = el.value;
                if (val === 'custom') return;
                const p = COLOR_PALETTES[val];
                if (p) Store.updateColors({ ...p });
                return;
            }

            // Section spacing/color
            if (action === 'update-section-spacing') {
                Store.updateSection(el.dataset.section, { spacing: el.value });
                return;
            }
        });

        // CLICK events (buttons)
        editor.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;

            if (action === 'add-personal') {
                Store.addPersonalItem(btn.dataset.field, '');
                return;
            }
            if (action === 'remove-personal') {
                Store.removePersonalItem(btn.dataset.field, parseInt(btn.dataset.index, 10));
                return;
            }
            if (action === 'add-section') {
                const secId = Store.addSection(btn.dataset.type);
                requestAnimationFrame(() => {
                    const card = document.querySelector(`.section-card[data-id="${secId}"]`);
                    if (card) card.scrollIntoView({ behavior: 'smooth' });
                });
                return;
            }
            if (action === 'remove-section') {
                Store.removeSection(btn.dataset.section);
                return;
            }
            if (action === 'duplicate-section') {
                e.stopPropagation();
                Store.duplicateSection(btn.dataset.section);
                return;
            }
            if (action === 'add-item') {
                const sec = Store.get().sections.find(s => s.id === btn.dataset.section);
                if (sec && sec.type === SECTION_TYPES.TAGS) {
                    Store.addItem(btn.dataset.section, { tag: '' });
                } else if (sec && sec.type === SECTION_TYPES.TABLE) {
                    Store.addItem(btn.dataset.section, { key: '', value: '' });
                } else {
                    Store.addItem(btn.dataset.section);
                }
                return;
            }
            if (action === 'remove-item') {
                Store.removeItem(btn.dataset.section, btn.dataset.item);
                return;
            }
            if (action === 'duplicate-item') {
                Store.duplicateItem(btn.dataset.section, btn.dataset.item);
                return;
            }
        });
    }

    // --- DRAG & DROP ---
    let _dragSrcEl = null;

    function _handleDragStart(e) {
        if (e.stopPropagation) e.stopPropagation();
        const target = e.target.closest('.card-box, .section-card');
        if (!target) return;
        target.style.opacity = '0.4';
        _dragSrcEl = target;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
        target.classList.add('dragging');
    }

    function _handleDragOver(e) {
        if (e.preventDefault) e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function _handleDragEnter(e) {
        const el = e.target.closest('.card-box, .section-card');
        if (el && _dragSrcEl && _dragSrcEl !== el && _dragSrcEl.parentNode === el.parentNode) {
            el.classList.add('drag-over');
        }
    }

    function _handleDragLeave(e) {
        const el = e.target.closest('.card-box, .section-card');
        if (el) el.classList.remove('drag-over');
    }

    function _handleDragEnd(e) {
        const target = e.target.closest('.card-box, .section-card');
        if (target) target.style.opacity = '1';
        document.querySelectorAll('.dragging, .drag-over').forEach(el => {
            el.classList.remove('dragging', 'drag-over');
        });
    }

    function _handleDrop(e) {
        if (e.stopPropagation) e.stopPropagation();
        if (e.preventDefault) e.preventDefault();
        const target = e.target.closest('.card-box, .section-card');
        if (!target || !_dragSrcEl || _dragSrcEl === target) return false;
        if (_dragSrcEl.parentNode !== target.parentNode) return false;

        const parent = target.parentNode;
        const children = [...parent.children];
        const srcIndex = children.indexOf(_dragSrcEl);
        const targetIndex = children.indexOf(target);

        // Section-level reorder
        if (_dragSrcEl.classList.contains('section-card')) {
            Store.reorderSections(srcIndex, targetIndex);
        }
        // Item-level reorder
        else if (_dragSrcEl.classList.contains('card-box')) {
            const sectionId = _dragSrcEl.dataset.section;
            if (sectionId) Store.reorderItems(sectionId, srcIndex, targetIndex);
        }
        return false;
    }

    // --- ATS PREVIEW ---

    function showATSPreview() {
        const state = Store.get();
        let text = '';
        text += `${state.personal.name}\n`;
        (state.personal.titles || []).forEach(t => text += `${t}\n`);
        (state.personal.contacts || []).forEach(c => text += `${c}\n`);
        (state.personal.links || []).forEach(l => text += `${l}\n`);
        text += '\n';

        (state.sections || []).forEach(sec => {
            if (!sec.isVisible) return;
            text += `${(sec.title || '').toUpperCase()}\n`;
            text += '-'.repeat((sec.title || '').length) + '\n';

            if (sec.type === SECTION_TYPES.TEXT) {
                text += `${sec.content || ''}\n\n`;
            } else if (sec.type === SECTION_TYPES.TAGS) {
                const tags = (sec.items || []).map(i => i.tag).filter(t => t);
                text += tags.join(', ') + '\n\n';
            } else if (sec.type === SECTION_TYPES.TABLE) {
                (sec.items || []).forEach(i => { text += `${i.key}: ${i.value}\n`; });
                text += '\n';
            } else if (sec.type === SECTION_TYPES.CONDENSED) {
                (sec.items || []).forEach(i => {
                    const parts = [i.l1, i.l3, i.desc?.replace(/\n/g, ' ')].filter(p => p);
                    text += parts.join(' • ');
                    if (i.l2) text += ` (${i.l2})`;
                    text += '\n';
                });
                text += '\n';
            } else if (sec.type === SECTION_TYPES.ACHIEVEMENTS) {
                (sec.items || []).forEach((i, idx) => { text += `${idx + 1}. ${i.desc || ''}\n`; });
                text += '\n';
            } else {
                // List
                (sec.items || []).forEach(i => {
                    text += `${i.l1} | ${i.l2}\n${i.l3}\n${i.desc || ''}\n\n`;
                });
            }
        });

        const modal = document.createElement('div');
        modal.style = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;z-index:999';
        modal.innerHTML = `
            <div style="background:#1e1e1e; color:#eee; padding:20px; width:600px; height:500px; display:flex; flex-direction:column; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.5); border:1px solid #333">
                <h3 style="margin-top:0">ATS Text Preview</h3>
                <p style="font-size:12px;color:#888">This is how a typical ATS parser sees your CV in plain text.</p>
                <textarea readonly style="flex:1;font-family:monospace;padding:15px;background:#121212;color:#ccc;border:1px solid #333;border-radius:6px;resize:none">${text}</textarea>
                <button onclick="this.parentElement.parentElement.remove()" style="margin-top:15px;padding:10px;background:#61afef;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold">Close</button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // --- VARIANTS ---

    function renderVariants(activeId) {
        const select = document.getElementById('variantSelect');
        if (!select) return;
        const variants = Storage.listVariants();
        select.innerHTML = '';
        variants.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.name;
            if (v.id === activeId) opt.selected = true;
            select.appendChild(opt);
        });
    }

    // --- SNAPSHOTS ---

    async function renderSnapshots(variantId) {
        const container = document.getElementById('snapshotsList');
        if (!container) return;
        const snaps = await Storage.listSnapshots(variantId);
        if (snaps.length === 0) {
            container.innerHTML = '<p style="color:#666;font-size:0.85rem;">No snapshots yet.</p>';
            return;
        }
        container.innerHTML = snaps.map(s => `
            <div class="snapshot-entry">
                <div class="snapshot-info">
                    ${s.label ? `<span class="snap-label">${_escapeHTML(s.label)}</span>` : ''}
                    <span class="snap-time">${new Date(s.timestamp).toLocaleString()} — ${_escapeHTML(s.name)}</span>
                </div>
                <div class="snapshot-actions">
                    <button data-action="restore-snapshot" data-snapshot="${s.id}">Restore</button>
                    <button data-action="delete-snapshot" data-snapshot="${s.id}">Delete</button>
                </div>
            </div>
        `).join('');
    }

    // --- HELPERS ---

    function _autoGrow(el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }

    function _setValIfNotFocused(id, value) {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) {
            el.value = value || '';
        }
    }

    function _escapeHTML(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _escapeAttr(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    return {
        initTabs, initTheme, initEventDelegation,
        fullRender, renderPersonalInfo, renderSections, renderDesign, renderMeta,
        renderVariants, renderSnapshots, showATSPreview,
        _handleDragStart, _handleDragEnd, _handleDragOver,
        _handleDragEnter, _handleDragLeave, _handleDrop
    };
})();
