// Compares Dota's current version, abilities and official Ability Draft pool against the committed
// snapshot. Reports Dota version changes, added, removed and renamed abilities, changes to each
// hero's draft pool, and config entries that reference abilities that no longer exist.
//
// Usage:
//   npm run abilities:diff                        read from the local Dota install
//   npm run abilities:diff -- --game-dir <dir>    read from a folder laid out like `game/dota`:
//                                                 steam.inf plus an extracted pak01_dir/ folder
//   npm run abilities:diff -- --update            also rewrite the snapshot
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
const PATCH_NOTES = "resource/localization/patchnotes/patchnotes_english.txt";
const NON_ABILITY_KEYS = new Set(["Version", "ability_base", "dota_base_ability"]);

function parseArgs(argv) {
    const args = { update: false, gameDir: undefined };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--update") args.update = true;
        else if (argv[i] === "--game-dir") args.gameDir = argv[++i];
        else throw new Error(`Unknown argument '${argv[i]}'`);
    }
    return args;
}

/**
 * Returns an object that reads packed game files by path (e.g. "scripts/npc/npc_abilities.txt"),
 * lists the files of a packed folder, and reads steam.inf, which sits next to the VPK.
 */
async function createFileSource(gameDir) {
    if (gameDir !== undefined) {
        const root = path.resolve(gameDir);
        const toLocal = gamePath => path.join(root, "pak01_dir", gamePath);
        return {
            description: root,
            steamInf: readIfExists(path.join(root, "steam.inf")),
            read: gamePath => {
                const file = toLocal(gamePath);
                return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
            },
            list: packedDir => {
                const dir = toLocal(packedDir);
                return fs.existsSync(dir) ? fs.readdirSync(dir).map(name => path.posix.join(packedDir, name)) : [];
            },
        };
    }

    const dotaPath = await getDotaPath();
    if (dotaPath === undefined) {
        throw new Error("No Dota 2 installation found. Pass --game-dir <folder with steam.inf and pak01_dir/>.");
    }
    const gameRoot = path.join(dotaPath, "game", "dota");
    const vpk = new VpkReader(path.join(gameRoot, "pak01_dir.vpk"));
    return {
        description: gameRoot,
        steamInf: readIfExists(path.join(gameRoot, "steam.inf")),
        read: gamePath => vpk.read(gamePath)?.toString("utf8"),
        list: packedDir => vpk.list(packedDir),
    };
}

function readIfExists(file) {
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
}

/** Latest gameplay patch named in the patch notes (e.g. "7.41f") plus the client build from steam.inf. */
function readDotaVersion(source) {
    let patch = null;
    const notes = source.read(PATCH_NOTES);
    if (notes !== undefined) {
        const patches = new Set([...notes.matchAll(/"DOTA_Patch_(\d+)_(\d+)([a-z]?)_/g)].map(m => `${m[1]}.${m[2]}${m[3]}`));
        patch = [...patches].sort(comparePatches).pop() ?? null;
    }

    const inf = Object.fromEntries(
        (source.steamInf ?? "").split(/\r?\n/).map(line => line.split("=")).filter(parts => parts.length === 2),
    );
    return {
        patch,
        build: inf.ClientVersion !== undefined ? Number(inf.ClientVersion) : null,
        date: inf.VersionDate ?? null,
    };
}

function comparePatches(a, b) {
    const parse = v => v.match(/^(\d+)\.(\d+)([a-z]?)$/).slice(1);
    const [aMajor, aMinor, aLetter] = parse(a);
    const [bMajor, bMinor, bLetter] = parse(b);
    return Number(aMajor) - Number(bMajor) || Number(aMinor) - Number(bMinor) || aLetter.localeCompare(bLetter);
}

function formatVersion(version) {
    return `${version.patch ?? "unknown patch"} (build ${version.build ?? "?"}${version.date ? `, ${version.date}` : ""})`;
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
    return { dota: readDotaVersion(source), abilities, draftPool: sortKeys(draftPool) };
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
    const source = await createFileSource(args.gameDir);
    const current = loadGameData(source);
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    const snapshot = fs.existsSync(SNAPSHOT_FILE) ? JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8")) : undefined;

    const abilityCount = Object.keys(current.abilities).length;
    const heroCount = Object.keys(current.draftPool).length;
    console.log(`Dota ${formatVersion(current.dota)}: ${source.description}`);
    console.log(`Read ${abilityCount} abilities and ${heroCount} hero draft pools`);

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
        const before = snapshot.dota ?? {};
        if (before.patch !== current.dota.patch || before.build !== current.dota.build) {
            print("Dota version", [`${formatVersion(before)} -> ${formatVersion(current.dota)}`]);
        }
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
