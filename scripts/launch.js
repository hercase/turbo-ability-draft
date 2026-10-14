const { spawn } = require("child_process");
const path = require("path");
const { getAddonName, getDotaPath } = require("./utils");

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

    // You can add any arguments there
    // For example `+dota_launch_custom_game ${getAddonName()} dota` would automatically load "dota" map
    const args = ["-novid", "-tools", "-addon", getAddonName()];
    spawn(path.join(win64, "dota2.exe"), args, { detached: true, cwd: win64 });
})().catch(error => {
    console.error(error);
    process.exit(1);
});
