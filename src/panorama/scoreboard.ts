// Scoreboard (FlyoutScoreboard element): replaces Dota's own, opened with the same key. Keeps its key
// information (level, K/D/A, last hits and denies, gold, Aghanim's, ultimate and buyback status,
// respawn time, mute) and adds each player's drafted build. Not rebuilt: report, unit sharing and
// disable help (no Panorama API).
// Wrapped in a function so its names do not leak into the other Panorama scripts.
(() => {
    const root = $.GetContextPanel();
    const teams = [DOTATeam_t.DOTA_TEAM_GOODGUYS, DOTATeam_t.DOTA_TEAM_BADGUYS];
    const teamRows: Partial<Record<number, Panel>> = {
        [DOTATeam_t.DOTA_TEAM_GOODGUYS]: $("#RadiantRows"),
        [DOTATeam_t.DOTA_TEAM_BADGUYS]: $("#DireRows"),
    };
    const teamKills: Partial<Record<number, LabelPanel>> = {
        [DOTATeam_t.DOTA_TEAM_GOODGUYS]: $("#RadiantKills") as LabelPanel,
        [DOTATeam_t.DOTA_TEAM_BADGUYS]: $("#DireKills") as LabelPanel,
    };

    // Ability slot of the ultimate for heroes without a draft (see the server's layout in draft/build.ts).
    const ultimateSlot = 5;
    const shardModifier = "modifier_item_aghanims_shard";

    // Column widths, shared by the headings and the rows.
    const columns = {
        names: 240,
        level: 44,
        kda: 86,
        lhdn: 70,
        gold: 60,
        aghs: 56,
        ult: 56,
        build: 180,
    };

    interface ScoreRow {
        row: Panel;
        respawn: LabelPanel;
        level: LabelPanel;
        kda: LabelPanel;
        lhdn: LabelPanel;
        gold: LabelPanel;
        buyback: LabelPanel;
        scepter: Panel;
        shard: Panel;
        ult: LabelPanel;
        mute?: Panel;
    }

    const rows = new Map<PlayerID, ScoreRow>();
    let rowsKey = "";
    let visible = false;

    /** Lua arrays arrive as objects keyed "1", "2", ...; turn them back into arrays. */
    function toArray<T>(data: Record<string, T> | T[] | undefined): T[] {
        if (data === undefined) return [];
        if (Array.isArray(data)) return data;
        return Object.keys(data)
            .sort((a, b) => Number(a) - Number(b))
            .map(key => data[key]);
    }

    /** Dota's player color (stored as ABGR) as a CSS hex color. */
    function playerColor(playerId: PlayerID): string {
        const abgr = Players.GetPlayerColor(playerId);
        const channels = [abgr & 0xff, (abgr >> 8) & 0xff, (abgr >> 16) & 0xff];
        return "#" + channels.map(value => ("0" + value.toString(16)).slice(-2)).join("");
    }

    function createLabel(parent: Panel, className: string, text = "", width?: number): LabelPanel {
        const label = $.CreatePanel("Label", parent, "");
        label.AddClass(className);
        label.text = text;
        if (width !== undefined) label.style.width = `${width}px`;
        return label;
    }

    function createCell(parent: Panel, width: number): Panel {
        const cell = $.CreatePanel("Panel", parent, "");
        cell.AddClass("Cell");
        cell.style.width = `${width}px`;
        return cell;
    }

    function addAbility(parent: Panel, entry: string, ultimate: boolean): void {
        // Pool entries can group several abilities ("a,b"); the first one is the card.
        const ability = entry.split(",")[0];
        const image = $.CreatePanel("DOTAAbilityImage", parent, "");
        image.AddClass("RowAbility");
        image.SetHasClass("Ultimate", ultimate);
        image.abilityname = ability;
        image.SetPanelEvent("onmouseover", () => $.DispatchEvent("DOTAShowAbilityTooltip", image, ability));
        image.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideAbilityTooltip", image));
    }

    function addItemIcon(parent: Panel, itemName: string): Panel {
        const icon = $.CreatePanel("DOTAItemImage", parent, "");
        icon.AddClass("AghsIcon");
        icon.itemname = itemName;
        return icon;
    }

    function addHeadings(parent: Panel): void {
        const headings = $.CreatePanel("Panel", parent, "");
        headings.AddClass("HeadingRow");
        createLabel(headings, "Heading", "", columns.names);
        createLabel(headings, "Heading", $.Localize("#scoreboard_level"), columns.level);
        createLabel(headings, "Heading", $.Localize("#scoreboard_kda"), columns.kda);
        createLabel(headings, "Heading", $.Localize("#scoreboard_lhdn"), columns.lhdn);
        createLabel(headings, "Heading", $.Localize("#scoreboard_gold"), columns.gold);
        createLabel(headings, "Heading", $.Localize("#scoreboard_aghs"), columns.aghs);
        createLabel(headings, "Heading", $.Localize("#scoreboard_ult"), columns.ult);
        createLabel(headings, "Heading", $.Localize("#scoreboard_build"), columns.build);
    }

    /** Mutes set from this scoreboard, so the button updates at once even before Dota reports it. */
    const muted = new Set<PlayerID>();

    function updateMuteButton(button: Panel, playerId: PlayerID): void {
        const isMuted = muted.has(playerId) || Game.IsPlayerMuted(playerId);
        button.SetHasClass("Muted", isMuted);
        (button.GetChild(0) as LabelPanel).text = $.Localize(isMuted ? "#scoreboard_muted" : "#scoreboard_mute");
    }

    function buildRows(): void {
        for (const container of Object.values(teamRows)) container?.RemoveAndDeleteChildren();
        rows.clear();

        const draftPlayers = CustomNetTables.GetTableValue("draft", "players") ?? undefined;
        for (const team of teams) {
            const container = teamRows[team];
            if (container === undefined) continue;
            addHeadings(container);

            for (const playerId of Game.GetPlayerIDsOnTeam(team)) {
                const info = Game.GetPlayerInfo(playerId);
                const build = draftPlayers?.[String(playerId)];
                const hero = build !== undefined && build.hero !== "" ? build.hero : info.player_selected_hero;

                const row = $.CreatePanel("Panel", container, "");
                row.AddClass("ScoreRow");
                row.SetHasClass("LocalPlayer", playerId === Players.GetLocalPlayer());

                const identity = createCell(row, columns.names);
                identity.AddClass("Identity");
                const color = $.CreatePanel("Panel", identity, "");
                color.AddClass("RowColor");
                color.style.backgroundColor = playerColor(playerId);
                const portrait = $.CreatePanel("Panel", identity, "");
                portrait.AddClass("RowPortrait");
                const heroImage = $.CreatePanel("DOTAHeroImage", portrait, "", { heroimagestyle: "landscape" });
                heroImage.AddClass("RowHero");
                heroImage.heroname = hero;
                const respawn = createLabel(portrait, "RespawnTime");
                const names = $.CreatePanel("Panel", identity, "");
                names.AddClass("RowNames");
                createLabel(names, "RowPlayer", Players.GetPlayerName(playerId));
                createLabel(names, "RowHeroName", hero !== "" ? $.Localize(`#${hero}`) : "");

                const level = createLabel(createCell(row, columns.level), "RowStat");
                const kda = createLabel(createCell(row, columns.kda), "RowStat");
                const lhdn = createLabel(createCell(row, columns.lhdn), "RowStat");
                const goldCell = createCell(row, columns.gold);
                goldCell.AddClass("Stacked");
                const gold = createLabel(goldCell, "RowStat");
                gold.AddClass("Gold");
                const buyback = createLabel(goldCell, "Buyback", $.Localize("#scoreboard_buyback"));

                const aghsCell = createCell(row, columns.aghs);
                aghsCell.AddClass("Aghs");
                const scepter = addItemIcon(aghsCell, "item_ultimate_scepter");
                const shard = addItemIcon(aghsCell, "item_aghanims_shard");

                const ult = createLabel(createCell(row, columns.ult), "RowStat");

                const abilities = createCell(row, columns.build);
                abilities.AddClass("RowAbilities");
                if (build !== undefined) {
                    for (const ability of toArray(build.abilities as unknown as Record<string, string>)) {
                        addAbility(abilities, ability, false);
                    }
                    if (build.ultimate !== "") addAbility(abilities, build.ultimate, true);
                }

                let mute: Panel | undefined;
                // Bots (Steam ID 0) have no voice or chat to mute.
                const isBot = info.player_steamid === "0" || info.player_steamid === "";
                if (playerId !== Players.GetLocalPlayer() && !isBot) {
                    const button = $.CreatePanel("Panel", row, "");
                    button.AddClass("MuteButton");
                    $.CreatePanel("Label", button, "");
                    button.SetPanelEvent("onactivate", () => {
                        const mute = !(muted.has(playerId) || Game.IsPlayerMuted(playerId));
                        if (mute) muted.add(playerId);
                        else muted.delete(playerId);
                        Game.SetPlayerMuted(playerId, mute);
                        updateMuteButton(button, playerId);
                    });
                    updateMuteButton(button, playerId);
                    mute = button;
                }

                rows.set(playerId, { row, respawn, level, kda, lhdn, gold, buyback, scepter, shard, ult, mute });
            }
        }
    }

    function hasShard(hero: EntityIndex): boolean {
        for (let index = 0; index < Entities.GetNumBuffs(hero); index++) {
            if (Buffs.GetName(hero, Entities.GetBuff(hero, index)) === shardModifier) return true;
        }
        return false;
    }

    /** "Ready", seconds left, or a dash when not learned. */
    /** The drafted ultimate, found by name (F8 can move it off R), else whatever sits on R. */
    function ultimateStatus(hero: EntityIndex, playerId: PlayerID): string {
        const drafted = CustomNetTables.GetTableValue("draft", "players")?.[String(playerId)]?.ultimate ?? "";
        const ability =
            drafted !== ""
                ? Entities.GetAbilityByName(hero, drafted.split(",")[0])
                : Entities.GetAbility(hero, ultimateSlot);
        if (ability === -1 || Abilities.GetLevel(ability) === 0) return "–";
        const cooldown = Abilities.GetCooldownTimeRemaining(ability);
        return cooldown > 0 ? `${Math.ceil(cooldown)}s` : $.Localize("#scoreboard_ready");
    }

    function updateStats(): void {
        const key = teams.map(team => Game.GetPlayerIDsOnTeam(team).join(",")).join("|");
        // Rebuild when players change or once the draft data is available.
        const draftReady = CustomNetTables.GetTableValue("draft", "players") !== null;
        if (key + String(draftReady) !== rowsKey) {
            rowsKey = key + String(draftReady);
            buildRows();
        }

        const localTeam = Players.GetTeam(Players.GetLocalPlayer());
        for (const team of teams) {
            let kills = 0;
            const ally = team === localTeam;
            for (const playerId of Game.GetPlayerIDsOnTeam(team)) {
                const info = Game.GetPlayerInfo(playerId);
                kills += info.player_kills;
                const view = rows.get(playerId);
                if (view === undefined) continue;

                const hero = Players.GetPlayerHeroEntityIndex(playerId);
                const dead = hero !== -1 && !Entities.IsAlive(hero);
                view.row.SetHasClass("Dead", dead);
                view.respawn.text = dead && info.player_respawn_seconds > 0 ? String(info.player_respawn_seconds) : "";

                view.level.text = String(info.player_level);
                view.kda.text = `${info.player_kills} / ${info.player_deaths} / ${info.player_assists}`;
                view.lhdn.text = `${Players.GetLastHits(playerId)} / ${Players.GetDenies(playerId)}`;

                // Dota does not send enemy gold, buyback or cooldowns to the client; show a dash instead.
                view.gold.text = ally ? String(info.player_gold) : "–";
                view.buyback.SetHasClass("Hidden", !ally);
                view.buyback.SetHasClass("Available", ally && Players.CanPlayerBuyback(playerId));
                view.ult.text = ally && hero !== -1 ? ultimateStatus(hero, playerId) : "–";
                view.ult.SetHasClass("Ready", view.ult.text === $.Localize("#scoreboard_ready"));

                view.scepter.SetHasClass("Owned", hero !== -1 && Entities.HasScepter(hero));
                view.shard.SetHasClass("Owned", hero !== -1 && hasShard(hero));

                const state = info.player_connection_state;
                view.row.SetHasClass(
                    "Disconnected",
                    state === DOTAConnectionState_t.DOTA_CONNECTION_STATE_DISCONNECTED ||
                        state === DOTAConnectionState_t.DOTA_CONNECTION_STATE_ABANDONED,
                );
            }
            const label = teamKills[team];
            if (label !== undefined) label.text = String(kills);
        }
    }

    function tick(): void {
        if (visible) updateStats();
        $.Schedule(0.5, tick);
    }

    function setVisible(show: boolean): void {
        visible = show;
        root.SetHasClass("ScoreboardVisible", show);
        if (show) updateStats();
    }

    // Ours replaces Dota's: without this, the scoreboard key opens both.
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_FLYOUT_SCOREBOARD, false);

    // Dota sends this when the scoreboard key is pressed and released.
    $.RegisterEventHandler("DOTACustomUI_SetFlyoutScoreboardVisible" as never, root, setVisible as never);
    setVisible(false);
    tick();
})();
