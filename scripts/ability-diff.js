// Compares Dota's current ability list against the committed snapshot and reports added,
// removed and renamed abilities, plus config entries that reference missing abilities.
//
// Usage:
//   npm run abilities:diff                       read from the local Dota install (pak01_dir.vpk)
//   npm run abilities:diff -- --npc-dir <dir>    read from an extracted scripts/npc folder
//   npm run abilities:diff -- --update           also rewrite the snapshot
//
// Exits with code 1 when there are differences and --update was not passed.

const fs = require("fs");
const path = require("path");
const { getDotaPath } = require("./utils");
const { parseKV } = require("./lib/kv");
const { VpkReader } = require("./lib/vpk");

const CONFIG_DIR = path.resolve(__dirname, "..", "src", "vscripts", "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "game_config.json");
const SNAPSHOT_FILE = path.join(CONFIG_DIR, "ability_snapshot.json");
const ABILITIES_FILE = "scripts/npc/npc_abilities.txt";

// Top-level keys of npc_abilities.txt that are not abilities.
const NON_ABILITY_KEYS = new Set(["Version", "ability_base", "dota_base_ability"]);

function parseArgs(argv) {
    const args = { update: false, npcDir: undefined };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--update") args.update = true;
        else if (argv[i] === "--npc-dir") args.npcDir = argv[++i];
        else throw new Error(`Unknown argument '${argv[i]}'`);
    }
    return args;
}

/** Returns a function that reads a game file (path relative to the `dota` game folder). */
async function createFileSource(npcDir) {
    if (npcDir !== undefined) {
        const root = path.resolve(npcDir);
        return {
            description: root,
            read: relativePath => {
                const file = path.join(root, relativePath.replace(/^scripts\/npc\//i, ""));
                return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
            },
        };
    }

    const dotaPath = await getDotaPath();
    if (dotaPath === undefined) {
        throw new Error("No Dota 2 installation found. Pass --npc-dir <extracted scripts/npc folder>.");
    }
    const vpkFile = path.join(dotaPath, "game", "dota", "pak01_dir.vpk");
    const vpk = new VpkReader(vpkFile);
    return {
        description: vpkFile,
        read: relativePath => vpk.read(relativePath)?.toString("utf8"),
    };
}

function loadAbilities(source) {
    const text = source.read(ABILITIES_FILE);
    if (text === undefined) throw new Error(`Could not find ${ABILITIES_FILE} in ${source.description}`);

    // #base paths are relative to the including file's folder.
    const kv = parseKV(text, basePath => source.read(path.posix.join("scripts/npc", basePath)));
    const root = kv.DOTAAbilities;
    if (root === undefined) throw new Error(`${ABILITIES_FILE} has no DOTAAbilities block`);

    const abilities = {};
    for (const [name, data] of Object.entries(root)) {
        if (NON_ABILITY_KEYS.has(name) || typeof data !== "object") continue;
        abilities[name] = data.ID !== undefined ? Number(data.ID) : null;
    }
    return abilities;
}

function diff(previous, current) {
    const added = Object.keys(current).filter(name => !(name in previous));
    const removed = Object.keys(previous).filter(name => !(name in current));

    // An ability whose ID survived under a new name was renamed.
    const renamed = [];
    for (const oldName of [...removed]) {
        const id = previous[oldName];
        if (id === null) continue;
        const newName = added.find(name => current[name] === id);
        if (newName !== undefined) {
            renamed.push({ from: oldName, to: newName, id });
            removed.splice(removed.indexOf(oldName), 1);
            added.splice(added.indexOf(newName), 1);
        }
    }
    return { added: added.sort(), removed: removed.sort(), renamed };
}

function findStaleConfigEntries(config, current) {
    const stale = [];
    for (const section of ["blacklist", "overrides"]) {
        for (const name of Object.keys(config.abilities[section])) {
            if (!(name in current)) stale.push(`abilities.${section}.${name}`);
        }
    }
    return stale;
}

(async () => {
    const args = parseArgs(process.argv.slice(2));
    const source = await createFileSource(args.npcDir);
    const current = loadAbilities(source);
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    const snapshot = fs.existsSync(SNAPSHOT_FILE) ? JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8")) : undefined;

    console.log(`Read ${Object.keys(current).length} abilities from ${source.description}`);

    let hasChanges = false;
    if (snapshot === undefined) {
        console.log("No snapshot yet. Run with --update to create it.");
        hasChanges = true;
    } else {
        const { added, removed, renamed } = diff(snapshot.abilities, current);
        const print = (title, lines) => {
            if (lines.length === 0) return;
            hasChanges = true;
            console.log(`\n${title} (${lines.length}):`);
            for (const line of lines) console.log(`  ${line}`);
        };
        print("Added", added);
        print("Removed", removed);
        print("Renamed", renamed.map(r => `${r.from} -> ${r.to} (ID ${r.id})`));
    }

    const stale = findStaleConfigEntries(config, current);
    if (stale.length > 0) {
        console.log(`\nConfig entries for abilities that no longer exist (${stale.length}):`);
        for (const entry of stale) console.log(`  ${entry}`);
    }

    if (args.update) {
        const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
        fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify({ abilities: sorted }, undefined, 4) + "\n");
        console.log(`\nSnapshot written to ${path.relative(process.cwd(), SNAPSHOT_FILE)}`);
    } else if (!hasChanges && stale.length === 0) {
        console.log("No changes.");
    }

    process.exit(!args.update && (hasChanges || stale.length > 0) ? 1 : 0);
})().catch(error => {
    console.error(error.message ?? error);
    process.exit(1);
});
