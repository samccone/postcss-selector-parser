const fs = require("fs");
const path = require("path");
const selectors = fs
    .readFileSync(path.join(__dirname, "selectors.css"), "utf-8")
    .split("\n");

// Many thanks for this post which made this migration much easier.
// https://mathiasbynens.be/notes/css-escapes

/**
 *
 * @param {string} str
 * @returns {[string, number]|undefined}
 */
function gobbleHex(str) {
    const lower = str.toLowerCase();
    let hex = "";
    let spaceTerminated = false;
    for (let i = 0; i < 6 && lower[i] !== undefined; i++) {
        const code = lower.charCodeAt(i);
        // check to see if we are dealing with a valid hex char [a-f|0-9]
        const valid = (code >= 97 && code <= 102) || (code >= 48 && code <= 57);
        // https://drafts.csswg.org/css-syntax/#consume-escaped-code-point
        spaceTerminated = code === 32;
        if (!valid) {
            break;
        }
        hex += lower[i];
    }

    if (hex.length === 0) {
        return undefined;
    }
    const codePoint = parseInt(hex, 16);

    const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
    // Add special case for
    // "If this number is zero, or is for a surrogate, or is greater than the maximum allowed code point"
    // https://drafts.csswg.org/css-syntax/#maximum-allowed-code-point
    if (isSurrogate || codePoint === 0x0000 || codePoint > 0x10ffff) {
        return ["\uFFFD", hex.length + (spaceTerminated ? 1 : 0)];
    }

    return [
        String.fromCodePoint(codePoint),
        hex.length + (spaceTerminated ? 1 : 0),
    ];
}

const constainsEscape = /\\/;
function unesc_n(str) {
    let needToProcess = constainsEscape.test(str);
    if (!needToProcess) {
        return str;
    }
    
    let ret = "";
    for (let i = 0; i < str.length; i++) {
        if (str[i] === "\\") {
            const gobbled = gobbleHex(str.slice(i + 1, i + 7));
            if (gobbled !== undefined) {
                ret += gobbled[0];
                i += gobbled[1];
                continue;
            }

            // Retain a pair of \\ if double escaped `\\\\`
            // https://github.com/postcss/postcss-selector-parser/commit/268c9a7656fb53f543dc620aa5b73a30ec3ff20e
            if (str[i + 1] === "\\") {
                ret += "\\";
                i++;
                continue;
            }

            // if // is at the end of the string retain it
            // https://github.com/postcss/postcss-selector-parser/commit/01a6b346e3612ce1ab20219acc26abdc259ccefb
            if (str.length === i + 1) {
                ret += str[i];
            }
            continue;
        }

        ret += str[i];
    }

    return ret;
}

// https://source.chromium.org/chromium/chromium/src/+/master:third_party/devtools-frontend/src/front_end/panels/elements/StylesSidebarPane.js;l=3282-3301;drc=fca98ed75dcae230e4a6fb225ae2c46c43d4939b
function unescapeCssString(input) {
    // https://drafts.csswg.org/css-syntax/#consume-escaped-code-point
    const reCssEscapeSequence = /(?<!\\)\\(?:([a-fA-F0-9]{1,6})|(.))[\n\t\x20]?/gs;
    return input.replace(reCssEscapeSequence, (_, $1, $2) => {
        if ($2) {
            // Handle the single-character escape sequence.
            return $2;
        }
        // Otherwise, handle the code point escape sequence.
        const codePoint = parseInt($1, 16);
        const isSurrogate = 0xd800 <= codePoint && codePoint <= 0xdfff;
        if (isSurrogate || codePoint === 0x0000 || codePoint > 0x10ffff) {
            return "\uFFFD";
        }
        return String.fromCodePoint(codePoint);
    });
}

// ORIGINAL
// https://github.com/postcss/postcss-selector-parser/commit/5d7817b5ba9a40dbfb02a257f2d2c67ef94066f8
const whitespace = "[\\x20\\t\\r\\n\\f]";
const unescapeRegExp = new RegExp(
    "\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)",
    "ig"
);
function original(str) {
    return str.replace(unescapeRegExp, (_, escaped, escapedWhitespace) => {
        const high = "0x" + escaped - 0x10000;

        // NaN means non-codepoint
        // Workaround erroneous numeric interpretation of +"0x"
        // eslint-disable-next-line no-self-compare
        return high !== high || escapedWhitespace
            ? escaped
            : high < 0
            ? // BMP codepoint
              String.fromCharCode(high + 0x10000)
            : // Supplemental Plane codepoint (surrogate pair)
              String.fromCharCode(
                  (high >> 10) | 0xd800,
                  (high & 0x3ff) | 0xdc00
              );
    });
}

// https://derickbailey.com/2014/09/21/calculating-standard-deviation-with-array-map-and-array-reduce-in-javascript/
function standardDeviation(values) {
    var avg = average(values);

    var squareDiffs = values.map(function (value) {
        var diff = value - avg;
        var sqrDiff = diff * diff;
        return sqrDiff;
    });

    var avgSquareDiff = average(squareDiffs);

    var stdDev = Math.sqrt(avgSquareDiff);
    return stdDev;
}

function average(data) {
    var sum = data.reduce(function (sum, value) {
        return sum + value;
    }, 0);

    var avg = sum / data.length;
    return avg;
}

function bench(name, fn) {
    let runs = [];
    for (let i = 0; i < 1000; i++) {
        let s = Date.now();
        for (let s of selectors) {
            fn(s);
        }
        runs.push(Date.now() - s);
    }
    const max = runs.sort((a, b) => b - a)[0];
    const min = runs.sort((a, b) => a - b)[0];
    const std = standardDeviation(runs);
    console.log(
        name,
        `
        avg: ${average(runs)}ms
        std: ${std.toFixed(4)}ms
        max: ${max}ms
        min: ${min}ms
        `
    );
}

bench("original", original);
bench("new", unesc_n);
bench("chrome", unescapeCssString);
