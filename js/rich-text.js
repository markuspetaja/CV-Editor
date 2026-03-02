// --- RICH TEXT RENDERER ---
// Inline formatting for PDF text: *bold*, _italic_, ~underline~

function parseRichText(text) {
    const parts = [];
    let buffer = '';
    let state = 'r'; // r=regular, b=bold, i=italic, u=underline

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '*' && (state === 'r' || state === 'b')) {
            if (buffer) parts.push({ text: buffer, s: state });
            buffer = '';
            state = state === 'r' ? 'b' : 'r';
        } else if (char === '_' && (state === 'r' || state === 'i')) {
            if (buffer) parts.push({ text: buffer, s: state });
            buffer = '';
            state = state === 'r' ? 'i' : 'r';
        } else if (char === '~' && (state === 'r' || state === 'u')) {
            if (buffer) parts.push({ text: buffer, s: state });
            buffer = '';
            state = state === 'r' ? 'u' : 'r';
        } else {
            buffer += char;
        }
    }
    if (buffer) parts.push({ text: buffer, s: state });
    return parts;
}

function measureRichText(parts, fontReg, fontBold, fontItalic, size) {
    let width = 0;
    for (const p of parts) {
        const f = p.s === 'b' ? fontBold : p.s === 'i' ? fontItalic : fontReg;
        width += f.widthOfTextAtSize(p.text, size);
    }
    return width;
}

function wrapRichText(rawText, fontReg, fontBold, fontItalic, fontSize, maxWidth) {
    const spans = parseRichText(rawText);
    let words = [];
    for (const span of spans) {
        const spanWords = span.text.split(' ');
        for (let j = 0; j < spanWords.length; j++) {
            if (spanWords[j]) {
                words.push({ text: spanWords[j], s: span.s });
            }
        }
    }

    let lines = [];
    let currentLine = [];
    let currentWidth = 0;
    const spaceWidth = fontReg.widthOfTextAtSize(' ', fontSize);

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const f = w.s === 'b' ? fontBold : w.s === 'i' ? fontItalic : fontReg;
        const wWidth = f.widthOfTextAtSize(w.text, fontSize);

        if (currentLine.length === 0) {
            currentLine.push(w);
            currentWidth = wWidth;
        } else {
            if (currentWidth + spaceWidth + wWidth < maxWidth) {
                currentLine.push({ text: ' ', s: 'r' });
                currentLine.push(w);
                currentWidth += spaceWidth + wWidth;
            } else {
                lines.push(currentLine);
                currentLine = [w];
                currentWidth = wWidth;
            }
        }
    }
    if (currentLine.length > 0) lines.push(currentLine);
    return lines;
}

const drawRichLine = (page, lineChunks, x, y, fontReg, fontBold, fontItalic, size, color) => {
    let currentX = x;
    for (const chunk of lineChunks) {
        const f = chunk.s === 'b' ? fontBold : chunk.s === 'i' ? fontItalic : fontReg;
        page.drawText(chunk.text, {
            x: currentX,
            y: y,
            size: size,
            font: f,
            color: color
        });
        const chunkWidth = f.widthOfTextAtSize(chunk.text, size);
        // Draw underline
        if (chunk.s === 'u') {
            page.drawLine({
                start: { x: currentX, y: y - 1 },
                end: { x: currentX + chunkWidth, y: y - 1 },
                thickness: 0.5,
                color: color
            });
        }
        currentX += chunkWidth;
    }
};
