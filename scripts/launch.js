const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { getAddonName, getDotaPath } = require("./utils");

// Usage: `npm run launch` opens the Workshop Tools with this addon.
//        `npm run launch -- <map>` also starts the custom game on <map> (e.g. `dota`).
//        `npm run launch -- <map> --official-ad` first forces Dota's Ability Draft game mode (18), an
//        experiment: it checks whether the custom game can run on top of the official draft. A
//        published Workshop game cannot run console commands for its players.
(async () => {
    if (process.platform !== "win32") {
        console.log("Dota 2 Workshop Tools only run on Windows. Launch the addon from the Windows machine.");
        return;
    }

    const dotaPath = await getDotaPath();
    if (dotaPath === undefined) {
        throw new Error("No Dota 2 installation found.");
    }
    const win64 = path.join(dotaPath, "game", "bin", "win64");

    // -condebug writes the console to game/dota/console.log. Start each session with an empty log.
    const consoleLog = path.join(dotaPath, "game", "dota", "console.log");
    try {
        fs.rmSync(consoleLog, { force: true });
    } catch (error) {
        // Windows locks the log while Dota writes to it.
        if (error.code === "EPERM" || error.code === "EBUSY") {
            console.error("Dota is still running (its console.log is locked). Close it and launch again.");
            process.exit(1);
        }
        throw error;
    }

    const args = ["-novid", "-tools", "-condebug", "-addon", getAddonName()];
    const cliArgs = process.argv.slice(2);
    const map = cliArgs.find(arg => !arg.startsWith("--"));
    if (cliArgs.includes("--official-ad")) {
        // DOTA_GAMEMODE_ABILITY_DRAFT = 18. Console commands run in order, so this comes first.
        args.push("+sv_cheats", "1", "+dota_force_gamemode", "18");
    }
    if (map !== undefined) {
        args.push("+dota_launch_custom_game", getAddonName(), map);
    }

    spawn(path.join(win64, "dota2.exe"), args, { detached: true, cwd: win64 });
    console.log(`Launched: dota2.exe ${args.join(" ")}`);
    console.log(`Console log: ${consoleLog}`);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
