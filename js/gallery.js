// Gallery — overview grid + fullscreen lightbox with client-side EXIF (exifr)
// and C2PA (c2pa-js) extraction.

const IMAGES = [
    "DSC_5872.jpg",
    "DSC_5873.jpg",
    "DSC_5875.jpg",
    "DSC_5885.jpg",
    "DSC_5899.jpg",
    "DSC_5907.jpg",
    "DSC_5917-Enhanced-NR.jpg",
    "DSC_5918-Enhanced-NR.jpg",
    "DSC_5923.jpg",
];

const THUMB_DIR = "images/makro/";
const FULL_DIR = "images/makro/big/";

const C2PA_VERSION = "0.30.17";
const C2PA_BASE = `https://cdn.jsdelivr.net/npm/c2pa@${C2PA_VERSION}`;
const EXIFR_URL = "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.mjs";

const gallery = document.getElementById("gallery");
const lightbox = document.getElementById("lightbox");
const lbImage = document.getElementById("lightbox-image");
const lbClose = document.getElementById("lightbox-close");
const lbPrev = document.getElementById("lightbox-prev");
const lbNext = document.getElementById("lightbox-next");
const exifPanel = document.getElementById("exif-panel");
const crBadge = document.getElementById("cr-badge");
const c2paPanel = document.getElementById("c2pa-panel");
const c2paBody = document.getElementById("c2pa-body");
const c2paClose = document.getElementById("c2pa-close");

let currentIndex = -1;
let c2paLoader = null; // lazy-init promise for createC2pa
let exifrLoader = null; // lazy-init promise for exifr module
const c2paCache = new Map(); // file -> manifestStore (or null)
const exifCache = new Map(); // file -> exif object (or null)

// ---------- Build gallery grid ----------

function buildGallery() {
    const frag = document.createDocumentFragment();
    IMAGES.forEach((file, i) => {
        const item = document.createElement("button");
        item.className = "gallery__item";
        item.type = "button";
        item.dataset.index = String(i);
        item.setAttribute("aria-label", `Bild ${i + 1} von ${IMAGES.length} öffnen`);

        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        img.src = THUMB_DIR + file;
        img.alt = file.replace(/\.(jpe?g)$/i, "");
        img.addEventListener("load", () => img.classList.add("loaded"), { once: true });

        item.appendChild(img);
        item.addEventListener("click", () => openLightbox(i));
        frag.appendChild(item);
    });
    gallery.appendChild(frag);
}

// ---------- Lightbox ----------

function openLightbox(index) {
    currentIndex = (index + IMAGES.length) % IMAGES.length;
    const file = IMAGES[currentIndex];
    const url = FULL_DIR + file;

    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    lbImage.classList.remove("loaded");
    lbImage.src = "";
    lbImage.alt = file.replace(/\.(jpe?g)$/i, "");
    // Defer src so the fade transition can run.
    requestAnimationFrame(() => {
        lbImage.src = url;
    });
    lbImage.addEventListener("load", () => lbImage.classList.add("loaded"), { once: true });

    crBadge.hidden = true;
    closeC2paPanel();
    renderExifLoading();

    loadExif(url, file).then(renderExif).catch(renderExifError);
    loadC2pa(url, file).then((manifest) => {
        if (manifest) {
            crBadge.hidden = false;
        }
    }).catch(() => {
        // Silent — no C2PA → no badge.
    });
}

function closeLightbox() {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    closeC2paPanel();
    lbImage.src = "";
}

function step(delta) {
    openLightbox(currentIndex + delta);
}

// ---------- EXIF (exifr) ----------

function loadExifr() {
    if (!exifrLoader) {
        exifrLoader = import(EXIFR_URL).then((m) => m.default || m);
    }
    return exifrLoader;
}

async function loadExif(url, file) {
    if (exifCache.has(file)) return exifCache.get(file);
    const exifr = await loadExifr();
    const data = await exifr.parse(url, {
        tiff: true,
        exif: true,
        gps: false,
        ifd0: true,
        interop: false,
        translateValues: true,
        reviveValues: true,
    }).catch(() => null);
    exifCache.set(file, data);
    return data;
}

function fmtExposure(t) {
    if (t == null) return null;
    if (typeof t === "string") return t + " s";
    if (t >= 1) return `${t}s`;
    const denom = Math.round(1 / t);
    return `1/${denom} s`;
}

function fmtAperture(f) {
    if (f == null) return null;
    return `f/${typeof f === "number" ? f.toFixed(f < 10 ? 1 : 0) : f}`;
}

function fmtFocal(mm, mm35) {
    if (mm == null) return null;
    const main = `${typeof mm === "number" ? Math.round(mm) : mm} mm`;
    if (mm35 && Math.abs(mm35 - (typeof mm === "number" ? mm : 0)) > 1) {
        return `${main} (${typeof mm35 === "number" ? Math.round(mm35) : mm35} mm KB)`;
    }
    return main;
}

function fmtCamera(make, model) {
    if (!make && !model) return null;
    if (!model) return make;
    if (!make) return model;
    const brand = make.split(/\s+/)[0];
    if (model.toLowerCase().includes(brand.toLowerCase())) {
        return model.replace(new RegExp(brand, "i"), brand.charAt(0) + brand.slice(1).toLowerCase());
    }
    return `${brand.charAt(0) + brand.slice(1).toLowerCase()} ${model}`;
}

function fmtDate(d) {
    if (!d) return null;
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" });
}

function renderExifLoading() {
    exifPanel.innerHTML = '<div class="exif-panel__loading">lade Aufnahmedaten&hellip;</div>';
}

function renderExifError() {
    exifPanel.innerHTML = '<div class="exif-panel__loading">Aufnahmedaten nicht verf&uuml;gbar</div>';
}

function renderExif(d) {
    if (!d) return renderExifError();

    const items = [
        ["Kamera", fmtCamera(d.Make, d.Model)],
        ["Objektiv", d.LensModel || d.LensInfo],
        ["Brennweite", fmtFocal(d.FocalLength, d.FocalLengthIn35mmFormat)],
        ["Blende", fmtAperture(d.FNumber)],
        ["Belichtung", fmtExposure(d.ExposureTime)],
        ["ISO", d.ISO ? `ISO ${d.ISO}` : null],
        ["Datum", fmtDate(d.DateTimeOriginal || d.CreateDate)],
    ].filter(([, v]) => v != null && v !== "");

    if (!items.length) return renderExifError();

    exifPanel.innerHTML = items.map(([label, value]) => `
        <span class="exif-item">
            <span class="exif-item__label">${label}</span>
            <span class="exif-item__value">${escapeHtml(String(value))}</span>
        </span>
    `).join("");
}

// ---------- C2PA (c2pa-js) ----------

function loadC2paSdk() {
    if (!c2paLoader) {
        c2paLoader = import(`${C2PA_BASE}/+esm`).then(({ createC2pa }) =>
            createC2pa({
                wasmSrc: `${C2PA_BASE}/dist/assets/wasm/toolkit_bg.wasm`,
                workerSrc: `${C2PA_BASE}/dist/c2pa.worker.min.js`,
                settings: {
                    verify: {
                        verifyTrust: false,
                        ocspFetch: false,
                        remoteManifestFetch: false,
                    },
                },
            })
        );
    }
    return c2paLoader;
}

async function loadC2pa(url, file) {
    if (c2paCache.has(file)) return c2paCache.get(file);
    try {
        const c2pa = await loadC2paSdk();
        const result = await c2pa.read(url, {
            settings: { verify: { verifyTrust: false, ocspFetch: false } },
        });
        const manifest = result?.manifestStore?.activeManifest || null;
        c2paCache.set(file, manifest ? { manifest, store: result.manifestStore } : null);
        return c2paCache.get(file);
    } catch (err) {
        console.warn("C2PA read failed", err);
        c2paCache.set(file, null);
        return null;
    }
}

function openC2paPanel() {
    c2paPanel.hidden = false;
    requestAnimationFrame(() => c2paPanel.classList.add("is-open"));
    c2paBody.innerHTML = '<div class="c2pa-panel__loading">lade C2PA-Manifest&hellip;</div>';
    const file = IMAGES[currentIndex];
    const cached = c2paCache.get(file);
    if (cached) {
        renderC2pa(cached);
    } else {
        loadC2pa(FULL_DIR + file, file).then((res) => {
            if (res) renderC2pa(res);
            else c2paBody.innerHTML = '<div class="c2pa-panel__loading">Keine Content Credentials gefunden.</div>';
        });
    }
}

function closeC2paPanel() {
    c2paPanel.classList.remove("is-open");
    setTimeout(() => { if (!c2paPanel.classList.contains("is-open")) c2paPanel.hidden = true; }, 300);
}

function renderC2pa({ manifest, store }) {
    const claimGen = manifest.claimGenerator || "—";
    const claimGenInfo = (manifest.claimGeneratorInfo && manifest.claimGeneratorInfo[0]) || {};
    const generatorName = claimGenInfo.name || claimGen.split("/")[0] || claimGen;
    const generatorVersion = claimGenInfo.version || claimGen.split("/")[1] || "";
    const signature = manifest.signatureInfo || {};
    const issuer = signature.issuer || signature.cert_serial_number || null;
    const signedAt = signature.time ? fmtDate(signature.time) : null;
    const validation = store.validationStatus || [];
    const isValid = !validation.length;

    // Group actions
    const actions = [];
    (manifest.assertions?.data || manifest.assertions || []).forEach((assertion) => {
        const label = assertion.label || assertion.l || "";
        if (label.startsWith("c2pa.actions")) {
            const list = assertion.data?.actions || assertion?.actions || [];
            list.forEach((a) => actions.push(a.action || a));
        }
    });
    const actionCounts = {};
    actions.forEach((a) => {
        const name = String(a).replace(/^c2pa\./, "").replace(/_/g, " ");
        actionCounts[name] = (actionCounts[name] || 0) + 1;
    });

    // Ingredient thumbnail (original image preview, if available)
    const thumb = manifest.thumbnail?.getUrl?.()?.url || null;

    const statusClass = isValid ? "" : "is-warn";
    const statusText = isValid ? "g&uuml;ltig signiert" : "Validierung mit Hinweisen";

    c2paBody.innerHTML = `
        <div class="c2pa-section">
            <span class="c2pa-status ${statusClass}">${statusText}</span>
        </div>

        <div class="c2pa-section">
            <h4>Erstellt mit</h4>
            <div class="c2pa-row">
                <span class="c2pa-row__label">Anwendung</span>
                <span class="c2pa-row__value">${escapeHtml(generatorName)}${generatorVersion ? " " + escapeHtml(String(generatorVersion)) : ""}</span>
            </div>
            ${manifest.title ? `
                <div class="c2pa-row">
                    <span class="c2pa-row__label">Titel</span>
                    <span class="c2pa-row__value">${escapeHtml(manifest.title)}</span>
                </div>` : ""}
            ${manifest.format ? `
                <div class="c2pa-row">
                    <span class="c2pa-row__label">Format</span>
                    <span class="c2pa-row__value">${escapeHtml(manifest.format)}</span>
                </div>` : ""}
        </div>

        <div class="c2pa-section">
            <h4>Signatur</h4>
            ${issuer ? `
                <div class="c2pa-row">
                    <span class="c2pa-row__label">Aussteller</span>
                    <span class="c2pa-row__value">${escapeHtml(issuer)}</span>
                </div>` : ""}
            ${signedAt ? `
                <div class="c2pa-row">
                    <span class="c2pa-row__label">Signiert am</span>
                    <span class="c2pa-row__value">${escapeHtml(signedAt)}</span>
                </div>` : ""}
            ${signature.alg ? `
                <div class="c2pa-row">
                    <span class="c2pa-row__label">Algorithmus</span>
                    <span class="c2pa-row__value">${escapeHtml(signature.alg)}</span>
                </div>` : ""}
        </div>

        ${Object.keys(actionCounts).length ? `
            <div class="c2pa-section">
                <h4>Bearbeitungen</h4>
                <ul class="c2pa-actions">
                    ${Object.entries(actionCounts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([name, count]) => `
                            <li>
                                <span>${escapeHtml(name)}</span>
                                <span class="c2pa-actions__count">${count}&times;</span>
                            </li>
                        `).join("")}
                </ul>
            </div>` : ""}

        ${thumb ? `
            <div class="c2pa-section">
                <h4>Original-Vorschau</h4>
                <img class="c2pa-thumb" src="${thumb}" alt="C2PA Thumbnail">
            </div>` : ""}
    `;
}

// ---------- Helpers ----------

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ---------- Wire up events ----------

lbClose.addEventListener("click", closeLightbox);
lbPrev.addEventListener("click", () => step(-1));
lbNext.addEventListener("click", () => step(1));
crBadge.addEventListener("click", openC2paPanel);
c2paClose.addEventListener("click", closeC2paPanel);

lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
});

document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("is-open")) return;
    if (e.key === "Escape") {
        if (c2paPanel.classList.contains("is-open")) closeC2paPanel();
        else closeLightbox();
    } else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
});

buildGallery();
