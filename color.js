#!/usr/bin/env node

import paletteGenerator from './lib/paletteGenerator.js';

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

    for (let s = 0; s < sets; s++) {
        // Try to generate a palette via paletteGenerator; if it fails, fallback to HSL per-set
        let cols = null;
        try {
            if (typeof Math.random.seed === 'function') {
                Math.random.seed(Date.now() + s);
            }
            cols = paletteGenerator.generate(
                count,
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

        const hexes = (cols ? cols.map(c => (typeof c.hex === 'function' ? c.hex() : String(c))) :
            Array.from({ length: count }, (_, i) => {
                const hue = Math.round(((i / count) * 360 + s * 37) % 360);
                return hslToHex(hue, 0.65, 0.5);
            })
        );

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
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});


