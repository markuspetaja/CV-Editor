// --- KEYBOARD SHORTCUTS ---
// Global shortcut registry. Wired in main.js.

const Keyboard = (() => {
    const shortcuts = [];

    function register(key, modifiers, action, description) {
        shortcuts.push({ key: key.toLowerCase(), modifiers, action, description });
    }

    function init() {
        document.addEventListener('keydown', (e) => {
            // Don't intercept when typing in input/textarea unless it's a ctrl combo
            const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

            for (const sc of shortcuts) {
                const ctrl = sc.modifiers.includes('ctrl');
                const shift = sc.modifiers.includes('shift');
                const alt = sc.modifiers.includes('alt');

                if ((e.ctrlKey || e.metaKey) !== ctrl) continue;
                if (e.shiftKey !== shift) continue;
                if (e.altKey !== alt) continue;
                if (e.key.toLowerCase() !== sc.key) continue;

                // Allow ctrl combos even in inputs
                if (inInput && !ctrl) continue;

                e.preventDefault();
                sc.action(e);
                return;
            }
        });
    }

    function getShortcutList() {
        return shortcuts.map(s => ({
            combo: [...s.modifiers.map(m => m.charAt(0).toUpperCase() + m.slice(1)), s.key.toUpperCase()].join('+'),
            description: s.description
        }));
    }

    return { register, init, getShortcutList };
})();
