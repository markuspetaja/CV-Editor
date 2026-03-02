// --- SCHEMA & MIGRATIONS ---
// Canonical data shape, defaults, type enums, and versioned migrations.

const SCHEMA_VERSION = 5;

const SECTION_TYPES = {
    TEXT: 'text',
    LIST: 'list',
    CONDENSED: 'condensed',
    TAGS: 'tags',
    TABLE: 'table',
    ACHIEVEMENTS: 'achievements'
};

const SPACING_OPTIONS = ['tight', 'normal', 'loose'];
const DIVIDER_STYLES = ['none', 'line', 'bar'];
const PHOTO_SHAPES = ['none', 'square', 'rounded', 'circle'];
const PHOTO_POSITIONS = ['top-right', 'top-left'];
const PAGE_SIZES = ['A4', 'Letter'];
const SIZE_SCALES = ['compact', 'normal', 'spacious'];

const COLOR_PALETTES = {
    custom: { name: "#005371", header: "#005371", role: "#333333", body: "#666666", accent: "#333333" },
    navy: { name: "#0F3057", header: "#0F3057", role: "#005371", body: "#333333", accent: "#0F3057" },
    academic: { name: "#CE4A39", header: "#0F3057", role: "#CE4A39", body: "#333333", accent: "#F2D16B" },
    minimal: { name: "#2F3E46", header: "#D36746", role: "#2F3E46", body: "#666666", accent: "#D36746" },
    corporate: { name: "#163172", header: "#B02E2E", role: "#163172", body: "#333333", accent: "#163172" },
    mint: { name: "#1EC340", header: "#070707", role: "#1EC340", body: "#333333", accent: "#1EC340" },
    grayscale: { name: "#000000", header: "#333333", role: "#555555", body: "#333333", accent: "#000000" }
};

function createDefaultState() {
    return {
        schemaVersion: SCHEMA_VERSION,
        font: "Helvetica",
        sizeScale: "normal",
        pageSize: "A4",
        margins: "normal",
        dividerStyle: "line",
        photoShape: "none",
        photoPosition: "top-right",
        meta: {
            fileName: "jane-doe-cv",
            title: "Jane Doe — Senior Software Engineer",
            author: "Jane Doe",
            subject: "Resume / CV",
            keywords: "Software Engineer, JavaScript, Python, AWS, React, Node.js",
            creator: "CV Editor",
            producer: "PDF-Lib",
            lang: "en-US"
        },
        personal: {
            name: "Jane Doe",
            titles: ["Senior Software Engineer", "Full-Stack Developer"],
            contacts: ["jane.doe@example.com", "+1 (555) 000-0000", "New York, NY"],
            links: ["linkedin.com/in/janedoe", "github.com/janedoe", "janedoe.dev"]
        },
        sections: [
            {
                id: generateUUID(),
                type: SECTION_TYPES.TEXT,
                title: "SUMMARY",
                isVisible: true,
                spacing: "normal",
                color: null,
                content: "Results-driven full-stack engineer with 7+ years of experience designing and shipping scalable web applications. Deep expertise in JavaScript, Python, and cloud-native architecture on AWS. Known for bridging technical and product teams to deliver high-quality software on time. Passionate about clean code, developer experience, and mentoring junior engineers.",
                items: null
            },
            {
                id: generateUUID(),
                type: SECTION_TYPES.TAGS,
                title: "SKILLS",
                isVisible: true,
                spacing: "normal",
                color: null,
                content: null,
                items: [
                    { id: generateUUID(), tag: "JavaScript" },
                    { id: generateUUID(), tag: "TypeScript" },
                    { id: generateUUID(), tag: "React" },
                    { id: generateUUID(), tag: "Node.js" },
                    { id: generateUUID(), tag: "Python" },
                    { id: generateUUID(), tag: "AWS" },
                    { id: generateUUID(), tag: "Docker" },
                    { id: generateUUID(), tag: "PostgreSQL" },
                    { id: generateUUID(), tag: "Redis" },
                    { id: generateUUID(), tag: "GraphQL" },
                    { id: generateUUID(), tag: "Git" },
                    { id: generateUUID(), tag: "Agile / Scrum" },
                    { id: generateUUID(), tag: "CI/CD" },
                    { id: generateUUID(), tag: "Terraform" }
                ]
            },
            {
                id: generateUUID(),
                type: SECTION_TYPES.LIST,
                title: "EXPERIENCE",
                isVisible: true,
                spacing: "normal",
                color: null,
                content: null,
                items: [
                    {
                        id: generateUUID(),
                        l1: "Senior Software Engineer",
                        l2: "Jan 2021 — Present",
                        l3: "Acme Corp · New York, NY",
                        desc: "- Led a cross-functional team of 6 to redesign the core payment platform, reducing failed transaction rate by 34%.\n- Architected a microservices migration from a monolithic Rails app to Node.js + AWS Lambda, cutting infrastructure costs by $120k/year.\n- Introduced automated integration testing (Jest + Playwright), raising test coverage from 48% to 91%.\n- Mentored 3 mid-level engineers through technical design reviews and pair programming sessions."
                    },
                    {
                        id: generateUUID(),
                        l1: "Software Engineer",
                        l2: "Jun 2018 — Dec 2020",
                        l3: "WebCorp LLC · Remote",
                        desc: "- Built and maintained full-stack features for a SaaS e-commerce platform serving 200k+ monthly active users.\n- Optimised PostgreSQL query performance, reducing average page load time by 40%.\n- Developed an internal analytics dashboard (React + D3.js) used daily by the product and marketing teams.\n- Contributed to on-call rotation and incident response; reduced mean time to recovery by 25%."
                    },
                    {
                        id: generateUUID(),
                        l1: "Junior Developer",
                        l2: "Sep 2016 — May 2018",
                        l3: "StartupXYZ · Boston, MA",
                        desc: "- Implemented RESTful API endpoints in Python/Flask consumed by iOS and Android clients.\n- Collaborated with UX designers to build responsive front-end components in React.\n- Set up the company's first CI/CD pipeline using GitHub Actions and Heroku."
                    }
                ]
            },
            {
                id: generateUUID(),
                type: SECTION_TYPES.LIST,
                title: "EDUCATION",
                isVisible: true,
                spacing: "normal",
                color: null,
                content: null,
                items: [
                    {
                        id: generateUUID(),
                        l1: "BSc Computer Science",
                        l2: "2012 — 2016",
                        l3: "Massachusetts Institute of Technology",
                        desc: "Graduated with Honours (GPA 3.9). Capstone: Distributed fault-tolerant key-value store in Go. Teaching assistant for Algorithms (6.006)."
                    }
                ]
            },
            {
                id: generateUUID(),
                type: SECTION_TYPES.CONDENSED,
                title: "PROJECTS",
                isVisible: true,
                spacing: "normal",
                color: null,
                content: null,
                items: [
                    {
                        id: generateUUID(),
                        l1: "OpenMetrics",
                        l2: "2023",
                        l3: "github.com/janedoe/openmetrics",
                        desc: "Open-source real-time dashboard for aggregating server metrics. 1.4k GitHub stars. Built with React, WebSockets, and InfluxDB."
                    },
                    {
                        id: generateUUID(),
                        l1: "BudgetFlow",
                        l2: "2022",
                        l3: "budgetflow.app",
                        desc: "Personal finance tracker with AI-powered categorisation. Built with Next.js and OpenAI API. 8k monthly active users."
                    }
                ]
            },
            {
                id: generateUUID(),
                type: SECTION_TYPES.TABLE,
                title: "LANGUAGES",
                isVisible: true,
                spacing: "normal",
                color: null,
                content: null,
                items: [
                    { id: generateUUID(), key: "English", value: "Native" },
                    { id: generateUUID(), key: "Spanish", value: "Professional working proficiency" },
                    { id: generateUUID(), key: "French", value: "Elementary" }
                ]
            }
        ],
        colors: {
            name: "#005371",
            header: "#005371",
            role: "#333333",
            body: "#666666",
            accent: "#333333"
        },
        image: null,
        jobDescription: "",
        aiHistory: [],
        aiMatchScores: []
    };
}

// --- MIGRATIONS ---

function migrateV1toV2(data) {
    // v1: separate exp[], edu[], oth[] arrays → v2: unified sections[]
    const sections = [];
    if (Array.isArray(data.exp) && data.exp.length > 0) {
        sections.push({
            id: generateUUID(),
            type: SECTION_TYPES.LIST,
            title: "Experience",
            isVisible: true,
            spacing: "normal",
            color: null,
            content: null,
            items: data.exp.map(i => ({
                id: generateUUID(),
                l1: i.l1 || "", l2: i.l2 || i.dateStart || "",
                l3: i.l3 || "", desc: i.desc || i.l4 || ""
            }))
        });
    }
    if (Array.isArray(data.edu) && data.edu.length > 0) {
        sections.push({
            id: generateUUID(),
            type: SECTION_TYPES.LIST,
            title: "Education",
            isVisible: true,
            spacing: "normal",
            color: null,
            content: null,
            items: data.edu.map(i => ({
                id: generateUUID(),
                l1: i.l1 || "", l2: i.l2 || i.dateStart || "",
                l3: i.l3 || "", desc: i.desc || i.l4 || ""
            }))
        });
    }
    if (Array.isArray(data.oth) && data.oth.length > 0) {
        sections.push({
            id: generateUUID(),
            type: SECTION_TYPES.TEXT,
            title: "Skills",
            isVisible: true,
            spacing: "normal",
            color: null,
            items: null,
            content: data.oth.map(i => i.l1 + (i.desc ? ": " + i.desc : "")).join("\n")
        });
    }
    data.sections = sections;
    delete data.exp;
    delete data.edu;
    delete data.oth;
    data.schemaVersion = 2;
    return data;
}

function migrateV2toV3(data) {
    // v2→v3: add IDs to items, add explicit type field, add isCondensed handling
    if (Array.isArray(data.sections)) {
        data.sections = data.sections.map(sec => {
            // Determine type
            let type = sec.type;
            if (!type) {
                if (Array.isArray(sec.items)) {
                    type = sec.isCondensed ? SECTION_TYPES.CONDENSED : SECTION_TYPES.LIST;
                } else {
                    type = SECTION_TYPES.TEXT;
                }
            }
            // Ensure every item has an ID
            const items = Array.isArray(sec.items) ? sec.items.map(item => ({
                ...item,
                id: item.id || generateUUID()
            })) : null;

            return {
                id: sec.id || generateUUID(),
                type,
                title: sec.title || "",
                isVisible: sec.isVisible !== false,
                spacing: sec.spacing || "normal",
                color: sec.color || null,
                content: sec.content || null,
                items
            };
        });
    }
    delete data.isCondensed; // Top-level cleanup
    data.schemaVersion = 3;
    return data;
}

function migrateV3toV4(data) {
    // v3→v4: add new item fields (tag, key, value), add global design settings
    if (Array.isArray(data.sections)) {
        data.sections = data.sections.map(sec => {
            if (Array.isArray(sec.items)) {
                sec.items = sec.items.map(item => ({
                    id: item.id || generateUUID(),
                    l1: item.l1 || "",
                    l2: item.l2 || "",
                    l3: item.l3 || "",
                    desc: item.desc || "",
                    tag: item.tag || "",
                    key: item.key || "",
                    value: item.value || ""
                }));
            }
            return sec;
        });
    }

    // Add design fields with defaults
    if (!data.sizeScale) data.sizeScale = "normal";
    if (!data.pageSize) data.pageSize = "A4";
    if (!data.margins) data.margins = "normal";
    if (!data.dividerStyle) data.dividerStyle = "line";
    if (!data.photoShape) data.photoShape = data.image ? "square" : "none";
    if (!data.photoPosition) data.photoPosition = "top-right";

    // Normalize image to object format
    if (data.image && typeof data.image === 'string') {
        data.image = {
            base64: data.image,
            type: data.imageType || 'jpg',
            name: data.imageName || 'profile-photo'
        };
    }
    delete data.imageType;
    delete data.imageName;

    data.schemaVersion = 4;
    return data;
}

function migrateV4toV5(data) {
    // v4→v5: add job description, AI history, and match scores
    if (!data.jobDescription) data.jobDescription = "";
    if (!Array.isArray(data.aiHistory)) data.aiHistory = [];
    if (!Array.isArray(data.aiMatchScores)) data.aiMatchScores = [];
    data.schemaVersion = SCHEMA_VERSION;
    return data;
}
function migrateData(data) {
    if (!data) return createDefaultState();
    let v = data.schemaVersion || 1;

    // v1: has exp/edu/oth arrays instead of sections
    if (v < 2) {
        if (Array.isArray(data.exp) || Array.isArray(data.edu) || Array.isArray(data.oth)) {
            data = migrateV1toV2(data);
            v = 2;
        } else if (Array.isArray(data.sections)) {
            // Already has sections but no version — treat as v2
            data.schemaVersion = 2;
            v = 2;
        } else {
            return createDefaultState();
        }
    }
    if (v < 3) data = migrateV2toV3(data);
    if (v < 4) data = migrateV3toV4(data);
    if (v < 5) data = migrateV4toV5(data);

    // Ensure personal fields are arrays
    const p = data.personal || {};
    if (typeof p.titles === 'string') p.titles = [p.titles];
    if (typeof p.contacts === 'string') p.contacts = [p.contacts];
    if (typeof p.links === 'string') p.links = [p.links];
    if (!Array.isArray(p.titles)) p.titles = p.title ? [p.title] : [];
    if (!Array.isArray(p.contacts)) p.contacts = p.contact ? [p.contact] : [];
    if (!Array.isArray(p.links)) p.links = [];
    data.personal = p;

    return data;
}
