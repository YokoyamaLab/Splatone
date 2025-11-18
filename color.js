#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import paletteGenerator from './lib/paletteGenerator.js';
import open from 'open';
import chroma from 'chroma-js';

// Usage: node color.js <count> <sets>
// Example: node color.js 6 3
// Outputs HTML lines, each line is one set: comma-separated spans where
// each span shows the hex string in that color (text color set to the color).

function usage() {
    console.log('Usage: node color.js <count> <sets>');
    console.log('  count: number of colors per set (default 8)');
    console.log('  sets: number of sets to generate (default 1)');
    console.log('  --no-ansi: disable ANSI color escapes and output plain comma-separated HEX values');
}

async function main() {
    let argv = process.argv.slice(2) || [];
    if (argv.length === 0) {
        usage();
        return;
    }

    const noAnsi = argv.indexOf('--no-ansi') !== -1;
    argv = argv.filter(a => a !== '--no-ansi');

    const count = parseInt(argv[0], 10) || 8;
    const sets = parseInt(argv[1], 10) || 1;
    const generatedPalettes = [];
    const poolSize = Math.max((count || 1) * 3, (count || 1) + 6);

    for (let s = 0; s < sets; s++) {
        // Try to generate a palette via paletteGenerator; if it fails, fallback to HSL per-set
        let cols = null;
        try {
            if (typeof Math.random.seed === 'function') {
                Math.random.seed(Date.now() + s);
            }
            cols = paletteGenerator.generate(
                poolSize,
                function (color) {
                    var hcl = color.hcl();
                    return hcl[0] >= 0 && hcl[0] <= 360
                        && hcl[1] >= 54.96 && hcl[1] <= 134
                        && hcl[2] >= 19.14 && hcl[2] <= 90.23;
                },
                true,
                50,
                false,
                'CMC'
            );
        } catch (e) {
            cols = null;
        }

        function hslToHex(h, s, l) {
            s = Math.max(0, Math.min(1, s));
            l = Math.max(0, Math.min(1, l));
            const a = s * Math.min(l, 1 - l);
            function f(n) {
                const k = (n + h / 30) % 12;
                const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
                return Math.round(255 * color).toString(16).padStart(2, '0');
            }
            return `#${f(0)}${f(8)}${f(4)}`;
        }

        const rawHexes = (cols ? cols.map(c => (typeof c.hex === 'function' ? c.hex() : String(c))) :
            Array.from({ length: poolSize }, (_, i) => {
                const hue = Math.round(((i / poolSize) * 360 + s * 37) % 360);
                return hslToHex(hue, 0.65, 0.5);
            })
        );
        const uniqueHexes = [...new Map(rawHexes.map(h => [String(h).toUpperCase(), normalizeHex(h)])).values()];
        const hexes = selectDiverseColors(uniqueHexes, count);

        generatedPalettes.push(hexes);

        if (noAnsi) {
            console.log(hexes.join(','));
        } else {
            const esc = (r, g, b) => `\u001b[38;2;${r};${g};${b}m`;
            const reset = '\u001b[0m';
            function hexToRgb(hex) {
                const h = hex.replace('#', '');
                const bigint = parseInt(h, 16);
                return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
            }
            const out = hexes.map(h => {
                const rgb = hexToRgb(h);
                return `${esc(...rgb)}${h}${reset}`;
            }).join(',');
            console.log(out);
        }
    }

        await maybeLaunchPreview(generatedPalettes);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

function isInteractive() {
        return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

async function maybeLaunchPreview(palettes) {
        if (!isInteractive() || palettes.length === 0) {
                return;
        }
        const answer = await promptYesNo('Open browser preview? [y/N]: ');
        if (!/^y(es)?$/i.test(answer.trim())) {
                return;
        }
        try {
                await launchPreview(palettes);
        } catch (err) {
                console.warn('[color.js] Failed to open preview:', err?.message || err);
        }
}

function promptYesNo(question) {
        return new Promise((resolve) => {
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                rl.question(question, (answer) => {
                        rl.close();
                        resolve(answer || '');
                });
        });
}

async function launchPreview(palettes) {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'splatone-colors-'));
        const filePath = path.join(dir, 'index.html');
        const html = buildPreviewHtml(palettes);
        await fs.writeFile(filePath, html, 'utf8');
        await open(filePath, { wait: false });
}

function buildPreviewHtml(palettes) {
        const paletteData = JSON.stringify(palettes);
        return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Splatone Color Preview</title>
    <style>
        :root {
            font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            color-scheme: light dark;
        }
        body {
            margin: 0;
            padding: 0;
            background: #0f0f0f;
            color: #f5f5f5;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            font-size: 16px;
        }
        main {
            width: min(960px, 100%);
            padding: 32px 24px 48px;
        }
        h1 {
            margin-top: 0;
            font-size: clamp(1.5rem, 2vw, 2rem);
        }
        .palette {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 24px;
        }
        .palette h2 {
            margin: 0 0 12px;
            font-size: 1rem;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #9acdff;
        }
        .color-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
        }
        .color-card {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            padding: 12px 12px 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }
        .swatch {
            width: 100%;
            aspect-ratio: 5 / 3;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            transition: transform 0.15s ease;
        }
        .swatch:hover {
            transform: scale(1.02);
        }
        .color-picker {
            width: 100%;
            height: 40px;
            border: none;
            border-radius: 6px;
            padding: 0;
            background: transparent;
            cursor: pointer;
        }
        .hex-code {
            display: inline-flex;
            justify-content: center;
            align-items: center;
            padding: 10px;
            border-radius: 6px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            background: rgba(255, 255, 255, 0.05);
            color: inherit;
            font-family: "JetBrains Mono", "Cascadia Code", Consolas, monospace;
            font-size: 0.95rem;
            letter-spacing: 0.08em;
            cursor: pointer;
            transition: background 0.15s ease, border-color 0.15s ease;
        }
        .hex-code:hover {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(255, 255, 255, 0.4);
        }
        .toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            padding: 12px 20px;
            border-radius: 999px;
            background: rgba(0, 0, 0, 0.8);
            border: 1px solid rgba(255, 255, 255, 0.2);
            opacity: 0;
            transform: translateY(12px);
            transition: opacity 0.2s ease, transform 0.2s ease;
            pointer-events: none;
            font-size: 0.95rem;
        }
        .toast.visible {
            opacity: 1;
            transform: translateY(0);
        }
        @media (prefers-color-scheme: light) {
            body {
                background: #fafafa;
                color: #111;
            }
            .palette {
                background: #fff;
                border-color: rgba(15, 23, 42, 0.08);
            }
            .color-card {
                background: #f8fafc;
                border-color: rgba(15, 23, 42, 0.08);
            }
            .hex-code {
                background: rgba(15, 23, 42, 0.04);
                border-color: rgba(15, 23, 42, 0.1);
            }
            .hex-code:hover {
                background: rgba(15, 23, 42, 0.08);
            }
            .toast {
                background: rgba(15, 23, 42, 0.9);
                color: #fff;
            }
        }
    </style>
</head>
<body>
    <main>
        <h1>Splatone Palette Preview</h1>
        <p>Use the color pickers to fine-tune each swatch. Click any hex code to copy it to your clipboard.</p>
        <div id="palettes"></div>
    </main>
    <div class="toast" id="copy-toast">Copied</div>
    <script>
        const palettes = ${paletteData};
        const container = document.getElementById('palettes');

        function createPaletteSection(colors, index) {
            const section = document.createElement('section');
            section.className = 'palette';
            const heading = document.createElement('h2');
            heading.textContent = 'Set ' + (index + 1);
            section.appendChild(heading);
            const grid = document.createElement('div');
            grid.className = 'color-grid';
            colors.forEach((hex, colorIdx) => {
                grid.appendChild(createColorCard(hex, index, colorIdx));
            });
            section.appendChild(grid);
            return section;
        }

        function createColorCard(hex, setIdx, colorIdx) {
            const card = document.createElement('article');
            card.className = 'color-card';
            const swatch = document.createElement('div');
            swatch.className = 'swatch';
            swatch.style.background = hex;
            swatch.dataset.hex = hex;

            const picker = document.createElement('input');
            picker.type = 'color';
            picker.className = 'color-picker';
            picker.value = hex;
            picker.setAttribute('aria-label', 'Adjust color ' + (colorIdx + 1) + ' in set ' + (setIdx + 1));

            const hexButton = document.createElement('button');
            hexButton.type = 'button';
            hexButton.className = 'hex-code';
            hexButton.dataset.hex = hex.toUpperCase();
            hexButton.textContent = hex.toUpperCase();

            picker.addEventListener('input', () => {
                const value = picker.value.toUpperCase();
                swatch.style.background = value;
                hexButton.dataset.hex = value;
                hexButton.textContent = value;
            });

            hexButton.addEventListener('click', () => copyHex(hexButton.dataset.hex));

            card.appendChild(swatch);
            card.appendChild(picker);
            card.appendChild(hexButton);
            return card;
        }

        function renderPalettes() {
            container.innerHTML = '';
            palettes.forEach((colors, idx) => {
                container.appendChild(createPaletteSection(colors, idx));
            });
        }

        async function copyHex(hex) {
            try {
                await navigator.clipboard.writeText(hex);
                showToast(hex + ' copied');
            } catch (err) {
                showToast('Clipboard unavailable');
            }
        }

        let toastTimer = null;
        function showToast(message) {
            const toast = document.getElementById('copy-toast');
            toast.textContent = message;
            toast.classList.add('visible');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => toast.classList.remove('visible'), 1600);
        }

        renderPalettes();
    </script>
</body>
</html>`;
}

function normalizeHex(value) {
    const hex = String(value || '').trim();
    if (!hex) return '#000000';
    if (hex.startsWith('#')) {
        if (hex.length === 4) {
            return '#' + hex.slice(1).split('').map(ch => ch + ch).join('').toUpperCase();
        }
        return '#' + hex.slice(1, 7).padEnd(6, '0').toUpperCase();
    }
    if (/^[0-9a-f]{6}$/i.test(hex)) {
        return '#' + hex.toUpperCase();
    }
    return '#000000';
}

function labDistance(hexA, hexB) {
    try {
        const [L1, a1, b1] = chroma(hexA).lab();
        const [L2, a2, b2] = chroma(hexB).lab();
        const dL = L1 - L2;
        const da = a1 - a2;
        const db = b1 - b2;
        return Math.sqrt(dL * dL + da * da + db * db);
    } catch {
        return 0;
    }
}

function selectDiverseColors(hexes, count) {
    if (!Array.isArray(hexes) || hexes.length === 0) {
        return [];
    }
    if (hexes.length <= count) {
        return hexes.slice(0, count);
    }
    const pool = hexes.slice();
    const selected = [];
    let firstIdx = 0;
    let bestVariance = -Infinity;
    for (let i = 0; i < pool.length; i++) {
        const [L, a, b] = chroma(pool[i]).lab();
        const variance = (L - 50) * (L - 50) + a * a + b * b;
        if (variance > bestVariance) {
            bestVariance = variance;
            firstIdx = i;
        }
    }
    selected.push(pool.splice(firstIdx, 1)[0]);
    while (selected.length < count && pool.length) {
        let bestIdx = 0;
        let bestScore = -1;
        for (let i = 0; i < pool.length; i++) {
            const candidate = pool[i];
            let minDistance = Infinity;
            for (const chosen of selected) {
                minDistance = Math.min(minDistance, labDistance(candidate, chosen));
                if (minDistance === 0) break;
            }
            if (minDistance > bestScore) {
                bestScore = minDistance;
                bestIdx = i;
            }
        }
        selected.push(pool.splice(bestIdx, 1)[0]);
    }
    return selected;
}


