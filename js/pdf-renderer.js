// --- PDF RENDERER ---
// Pure function: renderPDF(state) → PDF bytes. No DOM reads during render.

const { PDFDocument, rgb, StandardFonts } = PDFLib;
let currentPdfBytes = null;
let _pdfDebounceTimer;

// Spacing multipliers per scale setting
const SPACING_MULTIPLIERS = { compact: 0.82, normal: 1.0, spacious: 1.2 };
const MARGIN_VALUES = { tight: 22, normal: 28, wide: 38 };
const PAGE_DIMENSIONS = {
    A4: { width: 595.28, height: 841.89 },
    Letter: { width: 612, height: 792 }
};

const FONT_BASE = {
    name: 30, title: 16, header: 16, role: 12, date: 11, body: 11,
    spacing: { name: 26, title: 16, header: 12, block: 8, line: 12 }
};

function triggerPDFRender() {
    const sb = document.getElementById('statusBar');
    if (sb) { sb.innerText = 'Saving...'; sb.className = 'status-pill status-saving'; }
    clearTimeout(_pdfDebounceTimer);
    _pdfDebounceTimer = setTimeout(() => renderPDF(Store.get()), 800);
}

async function renderPDF(state) {
    try {
        const pdfDoc = await PDFDocument.create();
        const scale = SPACING_MULTIPLIERS[state.sizeScale] || 1.0;
        const margin = MARGIN_VALUES[state.margins] || 28;
        const dims = PAGE_DIMENSIONS[state.pageSize] || PAGE_DIMENSIONS.A4;

        // Scale font metrics
        const FONT = {
            name: FONT_BASE.name, title: FONT_BASE.title,
            header: FONT_BASE.header, role: FONT_BASE.role,
            date: FONT_BASE.date, body: FONT_BASE.body,
            spacing: {
                name: FONT_BASE.spacing.name * scale,
                title: FONT_BASE.spacing.title * scale,
                header: FONT_BASE.spacing.header * scale,
                block: FONT_BASE.spacing.block * scale,
                line: FONT_BASE.spacing.line * scale
            }
        };

        // --- FONTS ---
        let font, fontBold, fontOblique;
        const fc = state.font || 'Helvetica';
        if (fc === 'TimesRoman') {
            font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
            fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
            fontOblique = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
        } else if (fc === 'Courier') {
            font = await pdfDoc.embedFont(StandardFonts.Courier);
            fontBold = await pdfDoc.embedFont(StandardFonts.CourierBold);
            fontOblique = await pdfDoc.embedFont(StandardFonts.CourierOblique);
        } else {
            font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
        }

        // --- COLORS ---
        const c = state.colors || {};
        const cName = hexToPdfColor(c.name || '#005371');
        const cHeader = hexToPdfColor(c.header || '#005371');
        const cRole = hexToPdfColor(c.role || '#333333');
        const cBody = hexToPdfColor(c.body || '#666666');
        const cAccent = hexToPdfColor(c.accent || '#333333');

        // --- METADATA ---
        const fullName = state.personal?.name || '';
        const jobTitle = (state.personal?.titles || [])[0] || '';
        pdfDoc.setTitle((state.meta?.title) || `${fullName} - ${jobTitle}`);
        pdfDoc.setAuthor((state.meta?.author) || fullName);
        if (state.meta?.subject) pdfDoc.setSubject(state.meta.subject);
        if (state.meta?.keywords) pdfDoc.setKeywords(state.meta.keywords.split(',').map(k => k.trim()));
        if (state.meta?.creator) pdfDoc.setCreator(state.meta.creator);
        if (state.meta?.producer) pdfDoc.setProducer(state.meta.producer);
        if (state.meta?.lang) pdfDoc.setLanguage(state.meta.lang);
        pdfDoc.setCreationDate(new Date());
        pdfDoc.setModificationDate(new Date());

        // --- PAGE SETUP ---
        const width = dims.width;
        const height = dims.height;
        let page = pdfDoc.addPage([width, height]);
        const contentWidth = width - margin * 2;
        let cursorY = height - margin;
        const bottomLimit = 40 * scale;
        let headerImageBottom = cursorY;

        const checkPageBreak = (needed) => {
            if (cursorY - needed < bottomLimit) {
                page = pdfDoc.addPage([width, height]);
                cursorY = height - margin;
                return true;
            }
            return false;
        };

        // --- IMAGE ---
        let imageWidth = 0;
        if (state.image && state.image.base64) {
            try {
                const imgBytes = base64ToUint8(state.image.base64).buffer;
                let pImg = state.image.type === 'png'
                    ? await pdfDoc.embedPng(imgBytes)
                    : await pdfDoc.embedJpg(imgBytes);
                const maxImgDim = 60;
                const imgDims = pImg.scaleToFit(maxImgDim, maxImgDim);
                imageWidth = imgDims.width;

                const imgX = state.photoPosition === 'top-left' ? margin : width - margin - imgDims.width;
                const imgY = height - margin - imgDims.height;

                // Draw clipping shape based on photoShape
                // Note: pdf-lib doesn't support clipping paths well, so we draw the image as-is
                page.drawImage(pImg, { x: imgX, y: imgY, width: imgDims.width, height: imgDims.height });
                headerImageBottom = imgY - 10;
            } catch (err) {
                console.warn('Image embed failed', err);
            }
        } else {
            headerImageBottom = cursorY;
        }

        // --- HEADER TEXT ---
        const headerTextMaxWidth = contentWidth - (imageWidth ? imageWidth + 20 : 0);
        const headerTextX = (state.photoPosition === 'top-left' && imageWidth) ? margin + imageWidth + 15 : margin;

        const drawHeaderText = (text, y, fontObj, size, color, maxW) => {
            let t = text;
            while (fontObj.widthOfTextAtSize(t + '...', size) > maxW && t.length > 0) t = t.slice(0, -1);
            if (t !== text) t += '...';
            page.drawText(t, { x: headerTextX, y, size, font: fontObj, color });
        };

        cursorY = height - margin - (FONT.name * 0.75);
        drawHeaderText(fullName, cursorY, fontBold, FONT.name, cName, headerTextMaxWidth);
        cursorY -= FONT.spacing.name;

        // Titles
        (state.personal?.titles || []).forEach(t => {
            if (!t) return;
            drawHeaderText(t, cursorY, font, FONT.title, cRole, headerTextMaxWidth);
            cursorY -= FONT.spacing.title;
        });

        // Contacts
        (state.personal?.contacts || []).forEach(c => {
            if (!c) return;
            drawHeaderText(c, cursorY, font, FONT.body, cBody, headerTextMaxWidth);
            cursorY -= FONT.spacing.line;
        });

        // Links
        (state.personal?.links || []).forEach(l => {
            if (!l) return;
            page.drawText(l, { x: headerTextX, y: cursorY, size: FONT.body, font, color: cHeader });
            // Try to add clickable link annotation
            try {
                const firstUrl = l.split(' ').find(w => w.includes('.com') || w.includes('http') || w.includes('.io') || w.includes('.org'));
                if (firstUrl) {
                    const w = font.widthOfTextAtSize(l, FONT.body);
                    const linkAnnot = page.doc.context.register(
                        page.doc.context.obj({
                            Type: 'Annot', Subtype: 'Link',
                            Rect: [headerTextX, cursorY, headerTextX + w, cursorY + 10],
                            Border: [0, 0, 0],
                            A: { Type: 'Action', S: 'URI', URI: firstUrl.startsWith('http') ? firstUrl : `https://${firstUrl}` }
                        })
                    );
                    const existingAnnots = page.node.lookup(PDFLib.PDFName.of('Annots'));
                    if (existingAnnots) {
                        existingAnnots.push(linkAnnot);
                    } else {
                        page.node.set(PDFLib.PDFName.of('Annots'), pdfDoc.context.obj([linkAnnot]));
                    }
                }
            } catch (e) { /* annotation failed, non-critical */ }
            cursorY -= FONT.spacing.line;
        });

        cursorY = Math.min(cursorY, headerImageBottom);
        cursorY -= 8;

        // Header divider
        if (state.dividerStyle !== 'none') {
            if (state.dividerStyle === 'bar') {
                page.drawRectangle({
                    x: margin, y: cursorY - 2, width: contentWidth, height: 3,
                    color: cHeader
                });
                cursorY -= 6;
            } else {
                page.drawLine({
                    start: { x: margin, y: cursorY },
                    end: { x: width - margin, y: cursorY },
                    thickness: 1, color: rgb(0.85, 0.85, 0.85)
                });
            }
        }
        cursorY -= 15;

        // === SECTION RENDERERS ===

        const getSectionColor = (sec) => sec.color ? hexToPdfColor(sec.color) : cHeader;
        const getSpacingScale = (sec) => {
            const s = sec.spacing || 'normal';
            return s === 'tight' ? 0.8 : s === 'loose' ? 1.25 : 1.0;
        };

        // --- TEXT SECTION ---
        const drawTextSection = (sec) => {
            const sColor = getSectionColor(sec);
            const ss = getSpacingScale(sec);
            checkPageBreak(50);
            page.drawText(sec.title || '', { x: margin, y: cursorY, size: FONT.header, font: fontBold, color: sColor });
            cursorY -= (FONT.spacing.header + 5) * ss;

            const content = sec.content || '';
            if (content) {
                content.split('\n').forEach(para => {
                    if (!para.trim()) { cursorY -= 5 * ss; return; }
                    let isBullet = para.trim().startsWith('-');
                    let clean = isBullet ? para.substring(para.indexOf('-') + 1).trim() : para;
                    let xOff = isBullet ? margin + 10 : margin;
                    let eW = isBullet ? contentWidth - 10 : contentWidth;

                    const lines = wrapRichText(clean, font, fontBold, fontOblique, FONT.body, eW);
                    lines.forEach((line, i) => {
                        checkPageBreak(15);
                        if (isBullet && i === 0)
                            page.drawText('•', { x: margin, y: cursorY - 2, size: 14, font: fontBold, color: cAccent });
                        drawRichLine(page, line, xOff, cursorY, font, fontBold, fontOblique, FONT.body, isBullet ? cAccent : cBody);
                        cursorY -= FONT.spacing.line * ss;
                    });
                });
            }
            cursorY -= 8 * ss;
        };

        // --- LIST SECTION ---
        const drawListSection = (sec) => {
            const items = (sec.items || []).filter(i => i.l1 || i.l2 || i.l3 || i.desc);
            if (items.length === 0) return;
            const sColor = getSectionColor(sec);
            const ss = getSpacingScale(sec);

            checkPageBreak(40);
            page.drawText(sec.title || '', { x: margin, y: cursorY, size: FONT.header, font: fontBold, color: sColor });
            cursorY -= (FONT.spacing.header + 5) * ss;

            items.forEach((item, index) => {
                checkPageBreak(40);
                page.drawText(item.l1 || '', { x: margin, y: cursorY, size: FONT.role, font: fontBold, color: cRole });
                if (item.l2) {
                    const dW = fontOblique.widthOfTextAtSize(item.l2, FONT.date);
                    page.drawText(item.l2, { x: width - margin - dW, y: cursorY, size: FONT.date, font: fontOblique, color: cBody });
                }
                cursorY -= FONT.spacing.line * ss;

                if (item.l3) {
                    page.drawText(item.l3, { x: margin, y: cursorY, size: FONT.body, font, color: cBody });
                    cursorY -= FONT.spacing.line * ss;
                }

                if (item.desc) {
                    item.desc.split('\n').forEach(para => {
                        if (!para.trim()) return;
                        let isBullet = para.trim().startsWith('-');
                        let clean = isBullet ? para.substring(para.indexOf('-') + 1).trim() : para;
                        let xOff = isBullet ? margin + 10 : margin;
                        let eW = isBullet ? contentWidth - 10 : contentWidth;
                        const lines = wrapRichText(clean, font, fontBold, fontOblique, FONT.body, eW);
                        lines.forEach((line, i) => {
                            checkPageBreak(16);
                            if (isBullet && i === 0)
                                page.drawText('•', { x: margin, y: cursorY - 2, size: 14, font: fontBold, color: cAccent });
                            drawRichLine(page, line, xOff, cursorY, font, fontBold, fontOblique, FONT.body, cAccent);
                            cursorY -= FONT.spacing.line * ss;
                        });
                        cursorY -= 2 * ss;
                    });
                }

                if (index < items.length - 1 && !checkPageBreak(10)) {
                    cursorY += 4;
                    page.drawLine({
                        start: { x: margin + 10, y: cursorY },
                        end: { x: width - margin - 10, y: cursorY },
                        thickness: 0.5, color: rgb(0.9, 0.9, 0.9)
                    });
                    cursorY -= 12 * ss;
                } else {
                    cursorY -= FONT.spacing.block * ss;
                }
            });
            cursorY -= 5;
        };

        // --- CONDENSED SECTION ---
        const drawCondensedSection = (sec) => {
            const items = (sec.items || []).filter(i => i.l1 || i.l3);
            if (items.length === 0) return;
            const sColor = getSectionColor(sec);
            const ss = getSpacingScale(sec);

            checkPageBreak(30);
            page.drawText(sec.title || '', { x: margin, y: cursorY, size: FONT.header, font: fontBold, color: sColor });
            cursorY -= (FONT.spacing.header + 5) * ss;

            items.forEach(item => {
                checkPageBreak(15);

                // Right-aligned year (l2) — draw first so we know reserved width
                let textMaxW = contentWidth;
                if (item.l2) {
                    const dW = fontOblique.widthOfTextAtSize(item.l2, FONT.date);
                    page.drawText(item.l2, {
                        x: width - margin - dW, y: cursorY,
                        size: FONT.date, font: fontOblique, color: cBody
                    });
                    textMaxW = contentWidth - dW - 8;
                }

                // Draw l1 (role/title) in thematic role color, bold
                let curX = margin;
                if (item.l1) {
                    const l1W = fontBold.widthOfTextAtSize(item.l1, FONT.role);
                    page.drawText(item.l1, {
                        x: curX, y: cursorY,
                        size: FONT.role, font: fontBold, color: cRole
                    });
                    curX += l1W + 5;
                }

                // Draw separator and l3 (organization) in body color
                if (item.l3 && curX < margin + textMaxW - 10) {
                    const sep = '·';
                    const sepW = font.widthOfTextAtSize(sep, FONT.body);
                    page.drawText(sep, { x: curX, y: cursorY, size: FONT.body, font, color: cBody });
                    curX += sepW + 5;

                    const remaining = margin + textMaxW - curX;
                    if (remaining > 10) {
                        page.drawText(item.l3, {
                            x: curX, y: cursorY,
                            size: FONT.body, font, color: cBody
                        });
                    }
                }

                cursorY -= FONT.spacing.line * ss;
            });
            cursorY -= 5;
        };

        // --- TAGS SECTION ---
        const drawTagsSection = (sec) => {
            const tags = (sec.items || []).map(i => i.tag).filter(t => t);
            if (tags.length === 0) return;
            const sColor = getSectionColor(sec);
            const ss = getSpacingScale(sec);

            checkPageBreak(30);
            page.drawText(sec.title || '', { x: margin, y: cursorY, size: FONT.header, font: fontBold, color: sColor });
            cursorY -= (FONT.spacing.header + 5) * ss;

            // Flowing tag layout
            const tagFontSize = FONT.body;
            const pillPadX = 8;
            const pillPadY = 3;
            const pillGap = 6;
            const pillHeight = tagFontSize + pillPadY * 2 + 2;
            let rowX = margin;

            tags.forEach(tag => {
                const tagWidth = font.widthOfTextAtSize(tag, tagFontSize) + pillPadX * 2;
                if (rowX + tagWidth > width - margin) {
                    cursorY -= pillHeight + pillGap;
                    rowX = margin;
                    checkPageBreak(pillHeight + 5);
                }

                // Draw pill background
                const pillY = cursorY - pillPadY;
                page.drawRectangle({
                    x: rowX, y: pillY - tagFontSize + 2,
                    width: tagWidth, height: pillHeight,
                    borderColor: cAccent,
                    borderWidth: 0.5,
                    color: rgb(0.95, 0.95, 0.95)
                });

                // Draw text centered in pill
                page.drawText(tag, {
                    x: rowX + pillPadX,
                    y: pillY - tagFontSize + pillPadY + 3,
                    size: tagFontSize, font, color: cBody
                });

                rowX += tagWidth + pillGap;
            });

            cursorY -= pillHeight + 10;
        };

        // --- TABLE SECTION ---
        const drawTableSection = (sec) => {
            const items = (sec.items || []).filter(i => i.key || i.value);
            if (items.length === 0) return;
            const sColor = getSectionColor(sec);
            const ss = getSpacingScale(sec);

            checkPageBreak(30);
            page.drawText(sec.title || '', { x: margin, y: cursorY, size: FONT.header, font: fontBold, color: sColor });
            cursorY -= (FONT.spacing.header + 5) * ss;

            const keyColWidth = contentWidth * 0.35;

            items.forEach((item, idx) => {
                checkPageBreak(15);

                // Subtle row shading for readability
                if (idx % 2 === 0) {
                    page.drawRectangle({
                        x: margin, y: cursorY - 3,
                        width: contentWidth, height: FONT.spacing.line * ss,
                        color: rgb(0.96, 0.96, 0.96)
                    });
                }

                page.drawText(item.key || '', {
                    x: margin + 4, y: cursorY, size: FONT.body, font: fontBold, color: cRole
                });
                page.drawText(item.value || '', {
                    x: margin + keyColWidth, y: cursorY, size: FONT.body, font, color: cBody
                });
                cursorY -= FONT.spacing.line * ss;
            });
            cursorY -= 8;
        };

        // --- ACHIEVEMENTS SECTION ---
        const drawAchievementsSection = (sec) => {
            const items = (sec.items || []).filter(i => i.desc);
            if (items.length === 0) return;
            const sColor = getSectionColor(sec);
            const ss = getSpacingScale(sec);

            checkPageBreak(30);
            page.drawText(sec.title || '', { x: margin, y: cursorY, size: FONT.header, font: fontBold, color: sColor });
            cursorY -= (FONT.spacing.header + 5) * ss;

            items.forEach((item, idx) => {
                checkPageBreak(15);
                const numStr = `${idx + 1}.`;
                const numWidth = fontBold.widthOfTextAtSize(numStr, FONT.body);
                page.drawText(numStr, { x: margin, y: cursorY, size: FONT.body, font: fontBold, color: cAccent });

                // Auto-bold numbers/percentages/dollars
                const text = (item.desc || '').replace(/(\d+[\d,.]*%?|\$\d+[\d,.]*)/g, '*$1*');
                const lines = wrapRichText(text, font, fontBold, fontOblique, FONT.body, contentWidth - numWidth - 8);
                lines.forEach((line, i) => {
                    checkPageBreak(15);
                    drawRichLine(page, line, margin + numWidth + 6, cursorY, font, fontBold, fontOblique, FONT.body, cBody);
                    cursorY -= FONT.spacing.line * ss;
                });
                cursorY -= 2 * ss;
            });
            cursorY -= 5;
        };

        // === MAIN RENDER LOOP ===
        (state.sections || []).forEach(sec => {
            if (!sec.isVisible) return;

            // Orphan prevention: ensure at least 40pt of space for section header + content
            checkPageBreak(40);

            switch (sec.type) {
                case SECTION_TYPES.TEXT: drawTextSection(sec); break;
                case SECTION_TYPES.LIST: drawListSection(sec); break;
                case SECTION_TYPES.CONDENSED: drawCondensedSection(sec); break;
                case SECTION_TYPES.TAGS: drawTagsSection(sec); break;
                case SECTION_TYPES.TABLE: drawTableSection(sec); break;
                case SECTION_TYPES.ACHIEVEMENTS: drawAchievementsSection(sec); break;
            }

            // Inter-section divider
            if (state.dividerStyle === 'line') {
                // Already using spacing, no extra divider between sections
            }
        });

        // === SAVE & DISPLAY ===
        currentPdfBytes = await pdfDoc.save();
        const base64String = uint8ToBase64(new Uint8Array(currentPdfBytes));

        const p1 = document.getElementById('pdf-preview-1');
        const p2 = document.getElementById('pdf-preview-2');
        if (p1 && p2) {
            const active = p1.classList.contains('active') ? p1 : p2;
            const inactive = active === p1 ? p2 : p1;
            inactive.onload = () => {
                inactive.classList.add('active');
                active.classList.remove('active');
                inactive.onload = null;
            };
            inactive.src = 'data:application/pdf;base64,' + base64String;
        }

        const sb = document.getElementById('statusBar');
        if (sb) { sb.innerText = 'Ready'; sb.className = 'status-pill status-ready'; }

    } catch (err) {
        console.error('PDF render error:', err);
        const sb = document.getElementById('statusBar');
        if (sb) { sb.innerText = 'Error'; sb.className = 'status-pill status-error'; }
    }
}

function downloadPDF(state) {
    if (currentPdfBytes) {
        let fileName = (state.meta?.fileName || '').trim();
        if (!fileName) {
            const name = state.personal?.name || 'resume';
            fileName = `cv-${name.replace(/\s+/g, '-').toLowerCase()}`;
        }
        if (!fileName.endsWith('.pdf')) fileName += '.pdf';
        Storage.exportPDF(currentPdfBytes, fileName.replace('.pdf', ''));
    } else {
        alert('PDF is still generating or failed. Check the status bar.');
    }
}
