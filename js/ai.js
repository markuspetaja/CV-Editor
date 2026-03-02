// --- AI MODULE ---
// Self-contained AI integration. Returns suggestions; never modifies store directly.

const AI = (() => {
    // --- PRICING (USD per 1M tokens) ---
    const PRICING = {
        // OpenAI
        // Gemini
        'gemini-2.5-flash': { input: 0.00, output: 0.00 }, // Free tier
        // Anthropic
    };

    // --- SESSION TRACKING ---
    let _session = {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        calls: 0
    };

    const PROVIDERS = {
        openai: {
            name: 'OpenAI',
            models: [
            ],
            defaultModel: '',
            buildRequest: (apiKey, messages, model) => ({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({ model, messages, temperature: 0.7 })
            }),
            getEndpoint: () => 'https://api.openai.com/v1/chat/completions',
            parseResponse: (json) => json.choices?.[0]?.message?.content || '',
            parseUsage: (json) => ({
                inputTokens: json.usage?.prompt_tokens || 0,
                outputTokens: json.usage?.completion_tokens || 0
            })
        },
        gemini: {
            name: 'Google Gemini',
            models: [
                { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }
            ],
            defaultModel: 'gemini-2.5-flash',
            buildRequest: (apiKey, messages, model) => ({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: messages.map(m => ({
                        role: m.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: m.content }]
                    }))
                })
            }),
            getEndpoint: (apiKey, model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            parseResponse: (json) => json.candidates?.[0]?.content?.parts?.[0]?.text || '',
            parseUsage: (json) => ({
                inputTokens: json.usageMetadata?.promptTokenCount || 0,
                outputTokens: json.usageMetadata?.candidatesTokenCount || 0
            })
        },
        anthropic: {
            name: 'Anthropic',
            models: [
            ],
            defaultModel: '',
            buildRequest: (apiKey, messages, model) => ({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 1024,
                    messages: messages.map(m => ({
                        role: m.role === 'system' ? 'user' : m.role,
                        content: m.content
                    }))
                })
            }),
            getEndpoint: () => 'https://api.anthropic.com/v1/messages',
            parseResponse: (json) => {
                const block = json.content?.find(b => b.type === 'text');
                return block?.text || '';
            },
            parseUsage: (json) => ({
                inputTokens: json.usage?.input_tokens || 0,
                outputTokens: json.usage?.output_tokens || 0
            })
        }
    };

    // --- TOKEN ESTIMATION ---
    // Approximate: ~4 chars per token for English (GPT tokenizer average)
    function estimateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    }

    function estimateCost(inputTokens, outputTokens, modelId) {
        const pricing = PRICING[modelId];
        if (!pricing) return 0;
        return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
    }

    function formatCost(cost) {
        if (cost === 0) return 'Free';
        if (cost < 0.001) return '<$0.001';
        if (cost < 0.01) return '$' + cost.toFixed(4);
        return '$' + cost.toFixed(3);
    }

    function formatTokens(n) {
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return n.toString();
    }

    function getModelPricing(modelId) {
        return PRICING[modelId] || null;
    }

    // --- CORE ---

    function getApiKey() {
        return document.getElementById('aiApiKey')?.value || localStorage.getItem('cv_ai_key') || '';
    }

    function saveApiKey(key) {
        localStorage.setItem('cv_ai_key', key);
    }

    function getProvider() {
        return document.getElementById('aiProvider')?.value || 'openai';
    }

    function getModel() {
        return document.getElementById('aiModel')?.value || '';
    }

    function getProviderModels(providerKey) {
        return PROVIDERS[providerKey]?.models || [];
    }

    function getDefaultModel(providerKey) {
        return PROVIDERS[providerKey]?.defaultModel || '';
    }

    function getSession() {
        return { ..._session };
    }

    function resetSession() {
        _session = { totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0, calls: 0 };
    }

    async function _callLLM(messages) {
        const providerKey = getProvider();
        const provider = PROVIDERS[providerKey];
        const apiKey = getApiKey();
        if (!apiKey) throw new Error('API key is required. Enter it in the AI tab.');
        if (!provider) throw new Error('Unknown provider');

        const model = getModel() || provider.defaultModel;
        saveApiKey(apiKey);

        // Pre-call estimate
        const inputText = messages.map(m => m.content).join(' ');
        const estimatedInput = estimateTokens(inputText);

        const endpoint = provider.getEndpoint(apiKey, model);
        const request = provider.buildRequest(apiKey, messages, model);

        const response = await fetch(endpoint, request);
        if (!response.ok) {
            const errText = await response.text();
            if (response.status === 429) {
                throw new Error('Quota exceeded (429). Check your plan/billing, or wait a minute and retry. Free-tier keys have limited requests per minute.');
            }
            if (response.status === 401 || response.status === 403) {
                throw new Error('Authentication failed. Check that your API key is correct and the relevant API is enabled.');
            }
            throw new Error(`API error ${response.status}: ${errText.substring(0, 200)}`);
        }
        const json = await response.json();
        const content = provider.parseResponse(json);

        // Extract actual usage from response
        let usage = provider.parseUsage ? provider.parseUsage(json) : null;
        if (!usage || (!usage.inputTokens && !usage.outputTokens)) {
            // Fallback to estimate
            usage = {
                inputTokens: estimatedInput,
                outputTokens: estimateTokens(content)
            };
            usage._estimated = true;
        }

        // Calculate cost and update session
        const callCost = estimateCost(usage.inputTokens, usage.outputTokens, model);
        _session.totalInputTokens += usage.inputTokens;
        _session.totalOutputTokens += usage.outputTokens;
        _session.totalCost += callCost;
        _session.calls++;

        // Store last call info for display
        _lastCallInfo = {
            model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cost: callCost,
            estimated: !!usage._estimated
        };

        // Fire event for UI update
        window.dispatchEvent(new CustomEvent('cv:ai-usage', { detail: _lastCallInfo }));

        return content;
    }

    let _lastCallInfo = null;
    function getLastCallInfo() { return _lastCallInfo; }

    function _cvToText(state) {
        let text = state.personal?.name + '\n';
        (state.personal?.titles || []).forEach(t => text += t + '\n');
        text += '\n';
        (state.sections || []).forEach(sec => {
            if (!sec.isVisible) return;
            text += `${sec.title}\n`;
            if (sec.content) text += sec.content + '\n';
            if (sec.items) {
                sec.items.forEach(item => {
                    if (item.tag) text += item.tag + ', ';
                    if (item.key) text += item.key + ': ' + (item.value || '') + '\n';
                    if (item.l1) text += `${item.l1} — ${item.l3 || ''}: ${item.desc || ''}\n`;
                });
            }
            text += '\n';
        });
        return text;
    }

    async function analyzeKeywords(state, jobDescription) {
        if (!jobDescription.trim()) throw new Error('Paste a job description first.');

        const cvText = _cvToText(state);
        const prompt = `You are an ATS (Applicant Tracking System) optimization expert.

Compare the following CV with the job description. Extract the important keywords and skills from the job description, then classify each as either PRESENT or MISSING in the CV.

Return ONLY a JSON object with this exact structure, no explanation:
{"present": ["keyword1", "keyword2"], "missing": ["keyword3", "keyword4"]}

JOB DESCRIPTION:
${jobDescription}

CV:
${cvText}`;

        const result = await _callLLM([
            { role: 'user', content: prompt }
        ]);

        const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        try {
            return JSON.parse(cleaned);
        } catch (e) {
            throw new Error('Failed to parse AI response. Try again.');
        }
    }

    async function rewriteSummary(state, jobDescription) {
        if (!jobDescription.trim()) throw new Error('Paste a job description first.');

        const cvText = _cvToText(state);
        const currentSummary = (state.sections || []).find(s =>
            s.type === SECTION_TYPES.TEXT && s.title.toLowerCase().includes('summary')
        )?.content || '';

        const prompt = `You are a professional CV writer specializing in ATS optimization.

Rewrite the following CV summary to better match the job description while keeping it authentic and professional. Incorporate relevant keywords naturally. Keep it to 2-3 sentences maximum.

CURRENT SUMMARY:
${currentSummary || '(no summary yet)'}

JOB DESCRIPTION:
${jobDescription}

CV CONTEXT:
${cvText}

Return ONLY the rewritten summary text, no explanation or formatting.`;

        return await _callLLM([{ role: 'user', content: prompt }]);
    }

    async function rewriteBullet(bulletText, jobDescription) {
        const prompt = `You are a professional CV writer. Rewrite this CV bullet point to be more achievement-oriented and include relevant keywords from the job description. Use action verbs and quantify results where possible. Keep it concise (1-2 lines).

BULLET POINT:
${bulletText}

JOB DESCRIPTION:
${jobDescription}

Return ONLY the rewritten bullet point, no explanation. Start with an action verb.`;

        return await _callLLM([{ role: 'user', content: prompt }]);
    }

    function checkCliches(state) {
        const cvText = _cvToText(state);
        return detectCliches(cvText);
    }

    // Pre-call cost preview (for UI display before clicking)
    function previewCost(promptText) {
        const model = getModel() || PROVIDERS[getProvider()]?.defaultModel || '';
        const inputTokens = estimateTokens(promptText);
        const outputEstimate = Math.min(inputTokens, 500); // Assume ~500 output tokens
        const cost = estimateCost(inputTokens, outputEstimate, model);
        const pricing = PRICING[model];
        return {
            model,
            inputTokens,
            outputEstimate,
            cost,
            isFree: pricing && pricing.input === 0 && pricing.output === 0
        };
    }

    // Match score from keyword result
    function getMatchScore(keywordResult) {
        const present = keywordResult?.present?.length || 0;
        const missing = keywordResult?.missing?.length || 0;
        const total = present + missing;
        return total > 0 ? Math.round(present / total * 100) : 0;
    }

    // Build a structured history entry
    function buildResultEntry(type, result, jobDescription) {
        const info = _lastCallInfo || {};
        return {
            id: generateUUID(),
            timestamp: new Date().toISOString(),
            type, // 'keywords', 'rewrite', 'bullet', 'cliches'
            model: info.model || getModel() || '',
            jobSnippet: (jobDescription || '').substring(0, 150),
            result,
            usage: {
                inputTokens: info.inputTokens || 0,
                outputTokens: info.outputTokens || 0,
                cost: info.cost || 0,
                estimated: info.estimated || false
            },
            applied: false
        };
    }

    return {
        analyzeKeywords, rewriteSummary, rewriteBullet, checkCliches,
        getApiKey, saveApiKey, getProviderModels, getDefaultModel,
        getSession, resetSession, getLastCallInfo, getModelPricing,
        estimateTokens, estimateCost, formatCost, formatTokens, previewCost,
        getMatchScore, buildResultEntry
    };
})();
