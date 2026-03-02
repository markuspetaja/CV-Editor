// --- STATE STORE ---
// Single source of truth. All mutations through store methods.
// Fires 'cv:statechange' after each mutation.

const Store = (() => {
    let _state = null;
    let _history = [];
    let _historyIndex = -1;
    const MAX_HISTORY = 50;
    let _batchDepth = 0;

    function _emit() {
        if (_batchDepth > 0) return;
        window.dispatchEvent(new CustomEvent('cv:statechange', { detail: _state }));
    }

    function _pushHistory() {
        if (_batchDepth > 0) return;
        // Trim future if we undid and then made a new change
        if (_historyIndex < _history.length - 1) {
            _history = _history.slice(0, _historyIndex + 1);
        }
        _history.push(deepClone(_state));
        if (_history.length > MAX_HISTORY) _history.shift();
        _historyIndex = _history.length - 1;
    }

    function init(state) {
        _state = deepClone(state);
        _history = [deepClone(_state)];
        _historyIndex = 0;
        _emit();
    }

    function get() {
        return deepClone(_state);
    }

    function getRaw() {
        return _state;
    }

    // --- BATCH (group multiple mutations into one history entry + one event) ---
    function batch(fn) {
        _batchDepth++;
        fn();
        _batchDepth--;
        if (_batchDepth === 0) {
            _pushHistory();
            _emit();
        }
    }

    // --- PERSONAL ---
    function updatePersonal(patch) {
        Object.assign(_state.personal, patch);
        _pushHistory();
        _emit();
    }

    function addPersonalItem(field, value = '') {
        if (Array.isArray(_state.personal[field])) {
            _state.personal[field].push(value);
            _pushHistory();
            _emit();
        }
    }

    function updatePersonalItem(field, index, value) {
        if (Array.isArray(_state.personal[field]) && index < _state.personal[field].length) {
            _state.personal[field][index] = value;
            _pushHistory();
            _emit();
        }
    }

    function removePersonalItem(field, index) {
        if (Array.isArray(_state.personal[field])) {
            _state.personal[field].splice(index, 1);
            _pushHistory();
            _emit();
        }
    }

    // --- META ---
    function updateMeta(patch) {
        Object.assign(_state.meta, patch);
        _pushHistory();
        _emit();
    }

    // --- GLOBAL SETTINGS ---
    function updateSetting(key, value) {
        _state[key] = value;
        _pushHistory();
        _emit();
    }

    function updateColors(patch) {
        Object.assign(_state.colors, patch);
        _pushHistory();
        _emit();
    }

    // --- SECTIONS ---
    function addSection(type) {
        const sec = {
            id: generateUUID(),
            type,
            title: '',
            isVisible: true,
            spacing: 'normal',
            color: null,
            content: type === SECTION_TYPES.TEXT ? '' : null,
            items: type !== SECTION_TYPES.TEXT ? [] : null
        };
        _state.sections.push(sec);
        _pushHistory();
        _emit();
        return sec.id;
    }

    function updateSection(id, patch) {
        const sec = _state.sections.find(s => s.id === id);
        if (sec) {
            Object.assign(sec, patch);
            _pushHistory();
            _emit();
        }
    }

    function removeSection(id) {
        const idx = _state.sections.findIndex(s => s.id === id);
        if (idx !== -1) {
            _state.sections.splice(idx, 1);
            _pushHistory();
            _emit();
        }
    }

    function duplicateSection(id) {
        const sec = _state.sections.find(s => s.id === id);
        if (!sec) return null;
        const clone = deepClone(sec);
        clone.id = generateUUID();
        clone.title = sec.title + ' (copy)';
        if (Array.isArray(clone.items)) {
            clone.items.forEach(item => item.id = generateUUID());
        }
        const idx = _state.sections.findIndex(s => s.id === id);
        _state.sections.splice(idx + 1, 0, clone);
        _pushHistory();
        _emit();
        return clone.id;
    }

    function reorderSections(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        const [moved] = _state.sections.splice(fromIndex, 1);
        _state.sections.splice(toIndex, 0, moved);
        _pushHistory();
        _emit();
    }

    // --- ITEMS ---
    function addItem(sectionId, itemData = null) {
        const sec = _state.sections.find(s => s.id === sectionId);
        if (!sec || !Array.isArray(sec.items)) return null;

        const item = itemData ? { ...itemData, id: generateUUID() } : {
            id: generateUUID(),
            l1: '', l2: '', l3: '', desc: '',
            tag: '', key: '', value: ''
        };
        sec.items.push(item);
        _pushHistory();
        _emit();
        return item.id;
    }

    function updateItem(sectionId, itemId, patch) {
        const sec = _state.sections.find(s => s.id === sectionId);
        if (!sec || !Array.isArray(sec.items)) return;
        const item = sec.items.find(i => i.id === itemId);
        if (item) {
            Object.assign(item, patch);
            _pushHistory();
            _emit();
        }
    }

    function removeItem(sectionId, itemId) {
        const sec = _state.sections.find(s => s.id === sectionId);
        if (!sec || !Array.isArray(sec.items)) return;
        const idx = sec.items.findIndex(i => i.id === itemId);
        if (idx !== -1) {
            sec.items.splice(idx, 1);
            _pushHistory();
            _emit();
        }
    }

    function duplicateItem(sectionId, itemId) {
        const sec = _state.sections.find(s => s.id === sectionId);
        if (!sec || !Array.isArray(sec.items)) return null;
        const idx = sec.items.findIndex(i => i.id === itemId);
        if (idx === -1) return null;
        const clone = deepClone(sec.items[idx]);
        clone.id = generateUUID();
        sec.items.splice(idx + 1, 0, clone);
        _pushHistory();
        _emit();
        return clone.id;
    }

    function reorderItems(sectionId, fromIndex, toIndex) {
        const sec = _state.sections.find(s => s.id === sectionId);
        if (!sec || !Array.isArray(sec.items)) return;
        if (fromIndex === toIndex) return;
        const [moved] = sec.items.splice(fromIndex, 1);
        sec.items.splice(toIndex, 0, moved);
        _pushHistory();
        _emit();
    }

    // --- IMAGE ---
    function setImage(base64, type, name) {
        _state.image = { base64, type, name };
        _pushHistory();
        _emit();
    }

    function removeImage() {
        _state.image = null;
        _pushHistory();
        _emit();
    }

    // --- JOB DESCRIPTION ---
    function setJobDescription(text) {
        _state.jobDescription = text;
        // No history push for JD typing (too noisy)
        _emit();
    }

    // --- AI HISTORY ---
    const MAX_AI_HISTORY = 20;

    function addAiResult(entry) {
        if (!_state.aiHistory) _state.aiHistory = [];
        _state.aiHistory.unshift(entry); // newest first
        if (_state.aiHistory.length > MAX_AI_HISTORY) _state.aiHistory.pop();
        _pushHistory();
        _emit();
    }

    function removeAiResult(id) {
        if (!_state.aiHistory) return;
        _state.aiHistory = _state.aiHistory.filter(e => e.id !== id);
        _pushHistory();
        _emit();
    }

    function markAiResultApplied(id) {
        if (!_state.aiHistory) return;
        const entry = _state.aiHistory.find(e => e.id === id);
        if (entry) entry.applied = true;
        _emit();
    }

    function clearAiHistory() {
        _state.aiHistory = [];
        _state.aiMatchScores = [];
        _pushHistory();
        _emit();
    }

    // --- MATCH SCORES ---
    function addMatchScore(score, model) {
        if (!_state.aiMatchScores) _state.aiMatchScores = [];
        _state.aiMatchScores.push({
            timestamp: new Date().toISOString(),
            score,
            model
        });
        // Keep last 20
        if (_state.aiMatchScores.length > 20) _state.aiMatchScores.shift();
        _emit();
    }

    // --- TAG ACTIONS (for "Add to Skills") ---
    function addTagToSection(sectionId, tagText) {
        const sec = _state.sections.find(s => s.id === sectionId);
        if (!sec || sec.type !== SECTION_TYPES.TAGS) return;
        if (!Array.isArray(sec.items)) sec.items = [];
        // Avoid duplicates
        if (sec.items.some(i => i.tag.toLowerCase() === tagText.toLowerCase())) return;
        sec.items.push({ id: generateUUID(), tag: tagText });
        _pushHistory();
        _emit();
    }

    function addTagsToSection(sectionId, tags) {
        const sec = _state.sections.find(s => s.id === sectionId);
        if (!sec || sec.type !== SECTION_TYPES.TAGS) return;
        if (!Array.isArray(sec.items)) sec.items = [];
        const existing = new Set(sec.items.map(i => i.tag.toLowerCase()));
        let added = 0;
        tags.forEach(t => {
            if (!existing.has(t.toLowerCase())) {
                sec.items.push({ id: generateUUID(), tag: t });
                existing.add(t.toLowerCase());
                added++;
            }
        });
        if (added > 0) {
            _pushHistory();
            _emit();
        }
        return added;
    }

    // --- UNDO / REDO ---
    function undo() {
        if (_historyIndex > 0) {
            _historyIndex--;
            _state = deepClone(_history[_historyIndex]);
            _emit();
            return true;
        }
        return false;
    }

    function redo() {
        if (_historyIndex < _history.length - 1) {
            _historyIndex++;
            _state = deepClone(_history[_historyIndex]);
            _emit();
            return true;
        }
        return false;
    }

    function canUndo() { return _historyIndex > 0; }
    function canRedo() { return _historyIndex < _history.length - 1; }

    return {
        init, get, getRaw, batch,
        updatePersonal, addPersonalItem, updatePersonalItem, removePersonalItem,
        updateMeta, updateSetting, updateColors,
        addSection, updateSection, removeSection, duplicateSection, reorderSections,
        addItem, updateItem, removeItem, duplicateItem, reorderItems,
        setImage, removeImage,
        setJobDescription, addAiResult, removeAiResult, markAiResultApplied,
        clearAiHistory, addMatchScore,
        addTagToSection, addTagsToSection,
        undo, redo, canUndo, canRedo
    };
})();
