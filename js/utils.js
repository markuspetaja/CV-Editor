// --- UTILITIES ---
// Pure helper functions. No state, no DOM, no side effects.

function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function debounce(fn, ms) {
    let timer;
    const debounced = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
    debounced.cancel = () => clearTimeout(timer);
    debounced.flush = (...args) => { clearTimeout(timer); fn(...args); };
    return debounced;
}

function deepClone(obj) {
    if (typeof structuredClone === 'function') return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, b };
}

function hexToPdfColor(hex) {
    const { r, g, b } = hexToRgb(hex);
    return PDFLib.rgb(r, g, b);
}

function uint8ToBase64(uint8) {
    let binary = '';
    for (let i = 0; i < uint8.byteLength; i++) {
        binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary);
}

function base64ToUint8(str) {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function sanitizePasteText(text) {
    if (!text) return '';
    return text
        .replace(/[\u2018\u2019]/g, "'")   // Smart single quotes
        .replace(/[\u201C\u201D]/g, '"')    // Smart double quotes
        .replace(/\u2013/g, '-')            // En dash
        .replace(/\u2014/g, '--')           // Em dash
        .replace(/\u2026/g, '...')          // Ellipsis
        .replace(/\u00A0/g, ' ')            // Non-breaking space
        .replace(/\r\n/g, '\n')             // Normalize line endings
        .replace(/\r/g, '\n');
}

// --- VALIDATION HELPERS ---

const PASSIVE_PATTERNS = [
    /\bwas\s+\w+ed\b/gi,
    /\bwere\s+\w+ed\b/gi,
    /\bbeen\s+\w+ed\b/gi,
    /\bbeing\s+\w+ed\b/gi,
    /\bwas\s+\w+en\b/gi,
    /\bwere\s+\w+en\b/gi,
    /\bwas responsible for\b/gi,
    /\bwas tasked with\b/gi,
    /\bwas involved in\b/gi,
];

function detectPassiveVoice(text) {
    if (!text) return [];
    const matches = [];
    PASSIVE_PATTERNS.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            matches.push({ phrase: match[0], index: match.index });
        }
    });
    return matches;
}

const CLICHE_LIST = [
    "team player", "hard worker", "passionate", "go-getter",
    "think outside the box", "results-driven", "detail-oriented",
    "self-motivated", "strong work ethic", "fast learner",
    "synergy", "leverage", "proactive", "dynamic",
    "excellent communication skills", "problem solver"
];

function detectCliches(text) {
    if (!text) return [];
    const lower = text.toLowerCase();
    return CLICHE_LIST.filter(c => lower.includes(c));
}

function checkDateConsistency(sections) {
    const warnings = [];
    const dateFormats = new Set();

    const datePatterns = {
        'Mon YYYY': /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/,
        'MM/YYYY': /\b\d{1,2}\/\d{4}\b/,
        'YYYY-MM': /\b\d{4}-\d{2}\b/,
        'YYYY': /\b(19|20)\d{2}\b/
    };

    sections.forEach(sec => {
        if (!Array.isArray(sec.items)) return;
        sec.items.forEach(item => {
            if (!item.l2) return;
            Object.entries(datePatterns).forEach(([name, pattern]) => {
                if (pattern.test(item.l2)) dateFormats.add(name);
            });
        });
    });

    if (dateFormats.size > 1) {
        warnings.push(`Inconsistent date formats detected: ${[...dateFormats].join(', ')}. Pick one style.`);
    }
    return warnings;
}

function countWords(state) {
    let total = 0;
    const text = (s) => { if (s) total += s.split(/\s+/).filter(w => w).length; };

    text(state.personal?.name);
    (state.personal?.titles || []).forEach(t => text(t));
    (state.personal?.contacts || []).forEach(c => text(c));

    (state.sections || []).forEach(sec => {
        if (!sec.isVisible) return;
        text(sec.title);
        text(sec.content);
        if (Array.isArray(sec.items)) {
            sec.items.forEach(item => {
                text(item.l1); text(item.l2); text(item.l3);
                text(item.desc); text(item.tag);
                text(item.key); text(item.value);
            });
        }
    });
    return total;
}
