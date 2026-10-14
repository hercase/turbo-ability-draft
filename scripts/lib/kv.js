// Minimal reader for Valve KeyValues (KV1) text, enough for Dota's npc_*.txt files.
// Supports quoted and unquoted tokens, // comments, [$PLATFORM] conditionals (ignored)
// and #base / #include directives resolved through a caller-provided file loader.

function tokenize(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (c === " " || c === "\t" || c === "\r" || c === "\n" || c === "﻿") {
            i++;
        } else if (c === "/" && text[i + 1] === "/") {
            while (i < text.length && text[i] !== "\n") i++;
        } else if (c === "{" || c === "}") {
            tokens.push({ type: c });
            i++;
        } else if (c === "[") {
            // Conditional such as [$WIN32]; it applies to the previous pair and is ignored.
            while (i < text.length && text[i] !== "]") i++;
            i++;
        } else if (c === '"') {
            let value = "";
            i++;
            while (i < text.length && text[i] !== '"') {
                if (text[i] === "\\" && i + 1 < text.length) {
                    const next = text[i + 1];
                    value += next === "n" ? "\n" : next === "t" ? "\t" : next;
                    i += 2;
                } else {
                    value += text[i++];
                }
            }
            i++;
            tokens.push({ type: "string", value });
        } else {
            let value = "";
            while (i < text.length && !/[\s{}"]/.test(text[i])) value += text[i++];
            tokens.push({ type: "string", value });
        }
    }
    return tokens;
}

/** Deep-merges `source` into `target`; keys already in `target` win. */
function mergeMissing(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (!(key in target)) {
            target[key] = value;
        } else if (isObject(target[key]) && isObject(value)) {
            mergeMissing(target[key], value);
        }
    }
}

function isObject(value) {
    return typeof value === "object" && value !== null;
}

/**
 * Parses KV text into nested plain objects. Duplicate keys: the first one wins, like the engine.
 * @param {string} text
 * @param {(path: string) => string | undefined} [loadInclude] Returns the text of a #base/#include
 *   file (path as written in the directive) or undefined when it cannot be found.
 */
function parseKV(text, loadInclude) {
    const tokens = tokenize(text);
    const bases = [];
    let pos = 0;

    function parseBlock(depth) {
        const result = {};
        while (pos < tokens.length) {
            const token = tokens[pos++];
            if (token.type === "}") {
                if (depth === 0) throw new Error("Unexpected '}' at top level");
                return result;
            }
            if (token.type !== "string") throw new Error(`Expected a key, got '${token.type}'`);

            const key = token.value;
            const directive = key.toLowerCase();
            if (depth === 0 && (directive === "#base" || directive === "#include")) {
                bases.push(tokens[pos++].value);
                continue;
            }

            const next = tokens[pos++];
            if (next === undefined) throw new Error(`Missing value for key '${key}'`);
            const value = next.type === "{" ? parseBlock(depth + 1) : next.value;
            if (!(key in result)) result[key] = value;
        }
        if (depth > 0) throw new Error("Unexpected end of input, missing '}'");
        return result;
    }

    const root = parseBlock(0);
    for (const basePath of bases) {
        const baseText = loadInclude?.(basePath);
        if (baseText === undefined) {
            throw new Error(`Could not load '${basePath}'`);
        }
        mergeMissing(root, parseKV(baseText, loadInclude));
    }
    return root;
}

module.exports = { parseKV };
