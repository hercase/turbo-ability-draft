// Compares Dota's current abilities and official Ability Draft pool against the committed snapshot.
// Reports added, removed and renamed abilities, changes to each hero's draft pool, and config
// entries that reference abilities that no longer exist.
//
// Usage:
//   npm run abilities:diff                       read from the local Dota install (pak01_dir.vpk)
//   npm run abilities:diff -- --npc-dir <dir>    read from an extracted scripts/npc folder
//   npm run abilities:diff -- --update           also rewrite the snapshot
//
// Exits with code 1 when there are differences and --update was not passed.
//
// Data layout (Dota 7.4x): generic abilities live in npc_abilities.txt, each hero's abilities in
// heroes/npc_dota_hero_*.txt under "AbilityDefinitions", and ability IDs in npc_ability_ids.txt.

const fs = require("fs");
const path = require("path");
const { getDotaPath } = require("./utils");
const { parseKV } = require("./lib/kv");
const { VpkReader } = require("./lib/vpk");

const CONFIG_DIR = path.resolve(__dirname, "..", "src", "vscripts", "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "game_config.json");
const SNAPSHOT_FILE = path.join(CONFIG_DIR, "ability_snapshot.json");

const NPC = "scripts/npc";
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

/**
 * Returns an object that reads game files by path relative to the `dota` game folder
 * (e.g. "scripts/npc/npc_abilities.txt") and lists the files of a folder.
 */
async function createFileSource(npcDir) {
    if (npcDir !== undefined) {
        const root = path.resolve(npcDir);
        const toLocal = gamePath => path.join(root, path.posix.relative(NPC, gamePath));
        return {
            description: root,
            read: gamePath => {
                const file = toLocal(gamePath);
                return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
            },
            list: gameDir => {
                const dir = toLocal(gameDir);
                return fs.existsSync(dir) ? fs.readdirSync(dir).map(name => path.posix.join(gameDir, name)) : [];
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
        read: gamePath => vpk.read(gamePath)?.toString("utf8"),
        list: gameDir => vpk.list(gameDir),
    };
}

function readKV(source, gamePath) {
    const text = source.read(gamePath);
    if (text === undefined) return undefined;
    // #base paths are relative to the including file's folder.
    const dir = path.posix.dirname(gamePath);
    return parseKV(text, basePath => source.read(path.posix.join(dir, basePath)));
}

function loadGameData(source) {
    const abilityNames = new Set();
    const addAbilities = block => {
        for (const [name, data] of Object.entries(block ?? {})) {
            if (!NON_ABILITY_KEYS.has(name) && typeof data === "object") abilityNames.add(name);
        }
    };

    const generic = readKV(source, `${NPC}/npc_abilities.txt`);
    if (generic === undefined) throw new Error(`Could not find ${NPC}/npc_abilities.txt in ${source.description}`);
    addAbilities(generic.DOTAAbilities);

    // Heroes: npc_heroes.txt plus one file per hero. Each hero may carry its own ability definitions
    // and its official Ability Draft pool ("AbilityDraftAbilities").
    const heroFiles = [`${NPC}/npc_heroes.txt`, ...source.list(`${NPC}/heroes`).filter(f => f.endsWith(".txt"))];
    const draftPool = {};
    for (const file of heroFiles) {
        const heroes = readKV(source, file)?.DOTAHeroes ?? {};
        for (const [hero, data] of Object.entries(heroes)) {
            if (typeof data !== "object" || !hero.startsWith("npc_dota_hero_") || hero === "npc_dota_hero_base") continue;
            addAbilities(data.AbilityDefinitions);
            if (typeof data.AbilityDraftAbilities === "object") {
                draftPool[hero] = Object.values(data.AbilityDraftAbilities);
            }
        }
    }

    const idsFile = readKV(source, `${NPC}/npc_ability_ids.txt`)?.DOTAAbilityIDs?.UnitAbilities ?? {};
    const ids = { ...idsFile.Floating, ...idsFile.Locked };

    const abilities = {};
    for (const name of [...abilityNames].sort()) {
        abilities[name] = ids[name] !== undefined ? Number(ids[name]) : null;
    }
    return { abilities, draftPool: sortKeys(draftPool) };
}

function sortKeys(object) {
    return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

function diffAbilities(previous, current) {
    const added = Object.keys(current).filter(name => !(name in previous));
    const removed = Object.keys(previous).filter(name => !(name in current));

    // An ability whose ID survived under a new name was renamed.
    const renamed = [];
    for (const oldName of [...removed]) {
        const id = previous[oldName];
        if (id === null) continue;
        const newName = added.find(name => current[name] === id);
        if (newName !== undefined) {
            renamed.push(`${oldName} -> ${newName} (ID ${id})`);
            removed.splice(removed.indexOf(oldName), 1);
            added.splice(added.indexOf(newName), 1);
        }
    }
    return { added, removed, renamed };
}

function diffDraftPool(previous, current) {
    const changes = [];
    for (const hero of new Set([...Object.keys(previous), ...Object.keys(current)])) {
        const before = previous[hero];
        const after = current[hero];
        if (before === undefined) changes.push(`${hero}: added [${after.join(", ")}]`);
        else if (after === undefined) changes.push(`${hero}: removed`);
        else if (before.join() !== after.join()) changes.push(`${hero}: [${before.join(", ")}] -> [${after.join(", ")}]`);
    }
    return changes.sort();
}

function findStaleConfigEntries(config, abilities) {
    const stale = [];
    for (const section of ["blacklist", "overrides"]) {
        for (const name of Object.keys(config.abilities[section])) {
            if (!(name in abilities)) stale.push(`abilities.${section}.${name}`);
        }
    }
    return stale;
}

(async () => {
    const args = parseArgs(process.argv.slice(2));
    const source = await createFileSource(args.npcDir);
    const current = loadGameData(source);
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    const snapshot = fs.existsSync(SNAPSHOT_FILE) ? JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8")) : undefined;

    const abilityCount = Object.keys(current.abilities).length;
    const heroCount = Object.keys(current.draftPool).length;
    console.log(`Read ${abilityCount} abilities and ${heroCount} hero draft pools from ${source.description}`);

    let changeCount = 0;
    const print = (title, lines) => {
        if (lines.length === 0) return;
        changeCount += lines.length;
        console.log(`\n${title} (${lines.length}):`);
        for (const line of lines) console.log(`  ${line}`);
    };

    if (snapshot === undefined) {
        console.log("No snapshot yet. Run with --update to create it.");
        changeCount++;
    } else {
        const { added, removed, renamed } = diffAbilities(snapshot.abilities, current.abilities);
        print("Added abilities", added);
        print("Removed abilities", removed);
        print("Renamed abilities", renamed);
        print("Ability Draft pool changes", diffDraftPool(snapshot.draftPool ?? {}, current.draftPool));
    }
    print("Config entries for abilities that no longer exist", findStaleConfigEntries(config, current.abilities));

    if (args.update) {
        fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(current, undefined, 4) + "\n");
        console.log(`\nSnapshot written to ${path.relative(process.cwd(), SNAPSHOT_FILE)}`);
    } else if (changeCount === 0) {
        console.log("No changes.");
    }

    process.exit(!args.update && changeCount > 0 ? 1 : 0);
})().catch(error => {
    console.error(error.message ?? error);
    process.exit(1);
});
