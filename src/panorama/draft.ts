// Draft screen (HeroSelection element). Reads the "draft" net table and sends "draft_pick" events.
// Wrapped in a function so its names do not leak into the other Panorama scripts.
(() => {
    const root = $.GetContextPanel();
    const phaseLabel = $("#DraftPhase") as LabelPanel;
    const timerLabel = $("#DraftTimer") as LabelPanel;
    const turnLabel = $("#DraftTurn") as LabelPanel;
    const pickOrder = $("#PickOrder");
    const legend = $("#DraftLegend") as LabelPanel;
    const nextTurnLabel = $("#DraftNextTurn") as LabelPanel;
    const yourTurnToast = $("#YourTurnToast");
    const timerProgress = $("#DraftTimerProgress");
    let wasLocalTurn = false;

    // Stock Dota sounds (both listed in Dota's own UI soundevents): Dota's draft pick sound for every
    // new pick, and the ready-check popup to call the local player's attention when their turn starts.
    const pickSound = "PlayerDraft.Pick";
    const yourTurnSound = "ui.ready_check.popup";

    // Aghanim's icons from Dota's own HUD (read from the game, not copied).
    const scepterIcon = "s2r://panorama/images/hud/reborn/aghsstatus_scepter_on_psd.vtex";
    const shardIcon = "s2r://panorama/images/hud/reborn/aghsstatus_shard_on_psd.vtex";

    /**
     * False until the first refresh with player data: picks that already exist when the screen loads
     * (reconnect, layout reload) are shown as they are, without flashes or sounds.
     */
    let primed = false;

    /** Length of the current phase or pick, measured when its end time first shows up. */
    let timerKey = "";
    let timerDuration = 1;
    const board = $("#DraftBoard");
    const teamColumns: Partial<Record<number, Panel>> = {
        [DOTATeam_t.DOTA_TEAM_GOODGUYS]: $("#RadiantPlayers"),
        [DOTATeam_t.DOTA_TEAM_BADGUYS]: $("#DirePlayers"),
    };

    let state: NetworkedData<DraftStateData> | undefined;
    let pool: NetworkedData<DraftPoolData> | undefined;
    let poolKey = "";
    let players: NetworkedData<Record<string, DraftPlayerData>> | undefined;
    let limits: NetworkedData<DraftLimitsData> | undefined;

    interface BoardEntry {
        /** Clickable frame holding the image and the picker's color bar. */
        frame: Panel;
        bar: Panel;
        /** Hero cards only: name of the player who took the hero. */
        tag?: LabelPanel;
        kind: DraftPickKind;
        ultimate: boolean;
        /** Pool hero the entry belongs to (the hero itself for a hero card). */
        hero: string;
    }

    const heroCardsPerRow = 4;

    /** Board entries by hero or ability name. */
    const boardEntries = new Map<string, BoardEntry>();
    /** Names already taken at the previous refresh, to flash new picks once. */
    let previouslyTaken = new Set<string>();

    /** Lua arrays arrive as objects keyed "1", "2", ...; turn them back into arrays. */
    function toArray<T>(data: Record<string, T> | T[] | undefined): T[] {
        if (data === undefined) return [];
        if (Array.isArray(data)) return data;
        return Object.keys(data)
            .sort((a, b) => Number(a) - Number(b))
            .map(key => data[key]);
    }

    function abilitiesOf(data: NetworkedData<DraftPlayerData>): string[] {
        return toArray(data.abilities as unknown as Record<string, string>);
    }

    /** Dota's player color (stored as ABGR) as a CSS hex color. */
    function playerColor(playerId: PlayerID): string {
        const abgr = Players.GetPlayerColor(playerId);
        const channels = [abgr & 0xff, (abgr >> 8) & 0xff, (abgr >> 16) & 0xff];
        return "#" + channels.map(value => ("0" + value.toString(16)).slice(-2)).join("");
    }

    function localPlayerData(): NetworkedData<DraftPlayerData> | undefined {
        return players?.[String(Players.GetLocalPlayer())];
    }

    function currentOrder(): PlayerID[] {
        return state === undefined ? [] : toArray(state.order as unknown as Record<string, PlayerID>);
    }

    function activePlayer(): PlayerID | undefined {
        if (state === undefined || state.phase !== "picking") return undefined;
        return currentOrder()[state.turn];
    }

    /** Hero or ability name -> player who took it. */
    function takenBy(): Map<string, PlayerID> {
        const taken = new Map<string, PlayerID>();
        for (const id of Object.keys(players ?? {})) {
            const data = players![id];
            const playerId = Number(id) as PlayerID;
            if (data.hero !== "") taken.set(data.hero, playerId);
            for (const ability of abilitiesOf(data)) taken.set(ability, playerId);
            if (data.ultimate !== "") taken.set(data.ultimate, playerId);
        }
        return taken;
    }

    /** Hero whose pool brought this ability. */
    function sourceHero(ability: string): string | undefined {
        const abilities = toArray(pool?.abilities as unknown as Record<string, NetworkedData<DraftPoolAbilityData>>);
        return abilities.find(entry => entry.name === ability)?.hero;
    }

    /**
     * Same rules as the server: one hero, up to N regular abilities, up to M ultimates, and at most
     * `maxAbilitiesPerHero` abilities from the same hero (0 = no limit).
     */
    function canLocalPlayerPick(kind: DraftPickKind, ultimate: boolean, hero: string): boolean {
        const mine = localPlayerData();
        if (mine === undefined || activePlayer() !== Players.GetLocalPlayer()) return false;
        if (kind === "hero") return mine.hero === "";

        const owned = [...abilitiesOf(mine), mine.ultimate].filter(name => name !== "");
        const perHeroLimit = limits?.maxAbilitiesPerHero ?? 0;
        if (perHeroLimit > 0 && owned.filter(name => sourceHero(name) === hero).length >= perHeroLimit) return false;

        if (ultimate) return mine.ultimate === "" && (limits?.ultimates ?? 1) > 0;
        return abilitiesOf(mine).length < (limits?.regularAbilities ?? 3);
    }

    /** Pool entries can group several abilities ("a,b"); the first one is shown on the card. */
    function cardAbility(entry: string): string {
        return entry.split(",")[0];
    }

    /** Panel whose ability tooltip is open; Dota sometimes misses the mouseout and leaves it on screen. */
    let tooltipOwner: Panel | undefined;

    function showAbilityTooltip(panel: Panel, ability: string): void {
        panel.SetPanelEvent("onmouseover", () => {
            tooltipOwner = panel;
            $.DispatchEvent("DOTAShowAbilityTooltip", panel, cardAbility(ability));
        });
        panel.SetPanelEvent("onmouseout", () => hideAbilityTooltip(panel));
    }

    function hideAbilityTooltip(panel: Panel): void {
        $.DispatchEvent("DOTAHideAbilityTooltip", panel);
        if (tooltipOwner === panel) tooltipOwner = undefined;
    }

    /** Closes a tooltip left open by a missed mouseout (checked on every update). */
    function closeStaleTooltip(): void {
        if (tooltipOwner !== undefined && (!tooltipOwner.IsValid() || !tooltipOwner.BHasHoverStyle())) {
            hideAbilityTooltip(tooltipOwner);
        }
    }

    /**
     * Click on the board, like the official draft: Alt+click tells your team you want it, Ctrl+click
     * suggests it to them, a plain click picks it (on your turn).
     */
    function onBoardClick(kind: DraftPickKind, name: string): void {
        if (GameUI.IsAltDown() || GameUI.IsControlDown()) {
            const suggest = !GameUI.IsAltDown();
            GameEvents.SendCustomGameEventToServer("draft_request", { kind, name, suggest });
            return;
        }
        sendPick(kind, name);
    }

    // Teammates' requests: a short feed, and a dot in each requester's color on the board entry.
    const requestFeed = $("#DraftRequests");
    const requestedBy = new Map<string, Set<PlayerID>>();
    const requestLifetimeSeconds = 8;

    function entryLabel(kind: DraftPickKind, name: string): string {
        return $.Localize(kind === "hero" ? `#${name}` : `#DOTA_Tooltip_ability_${cardAbility(name)}`);
    }

    function showRequest(data: NetworkedData<DraftRequestBroadcastData>): void {
        const playerId = data.player as PlayerID;
        const kind = data.kind as DraftPickKind;

        const item = createPanel("Panel", requestFeed, "RequestItem");
        createPanel("Panel", item, "RequestColor").style.backgroundColor = playerColor(playerId);
        if (kind === "hero") createHeroImage(item, data.name, "RequestIcon", "icon");
        else createAbilityImage(item, data.name, "RequestIcon");
        const text = createPanel("Label", item, "RequestText") as LabelPanel;
        text.SetDialogVariable("player", Players.GetPlayerName(playerId));
        text.SetDialogVariable("pick", entryLabel(kind, data.name));
        text.text = $.Localize(data.suggest ? "#draft_request_suggest" : "#draft_request_want", text);
        $.Schedule(requestLifetimeSeconds, () => {
            if (item.IsValid()) item.DeleteAsync(0);
        });

        // Dot on the board entry until it is taken.
        const requesters = requestedBy.get(data.name) ?? new Set<PlayerID>();
        requesters.add(playerId);
        requestedBy.set(data.name, requesters);
        updateRequestDots(data.name);
    }

    function updateRequestDots(name: string): void {
        const entry = boardEntries.get(name);
        if (entry === undefined) return;
        let dots = entry.frame.FindChildTraverse("RequestDots");
        if (dots === null) {
            dots = $.CreatePanel("Panel", entry.frame, "RequestDots");
            dots.AddClass("RequestDots");
        }
        dots.RemoveAndDeleteChildren();
        for (const playerId of requestedBy.get(name) ?? []) {
            createPanel("Panel", dots, "RequestDot").style.backgroundColor = playerColor(playerId);
        }
    }

    GameEvents.Subscribe("draft_request_broadcast", data => showRequest(data));

    function sendPick(kind: DraftPickKind, name: string): void {
        GameEvents.SendCustomGameEventToServer("draft_pick", { kind, name });
    }

    function createPanel(type: string, parent: Panel, className: string): Panel {
        const panel = $.CreatePanel(type, parent, "");
        panel.AddClass(className);
        return panel;
    }

    function createHeroImage(
        parent: Panel,
        hero: string,
        className: string,
        style: "icon" | "portrait" | "landscape" = "landscape",
    ): HeroImage {
        const image = $.CreatePanel("DOTAHeroImage", parent, "", { heroimagestyle: style });
        image.heroname = hero;
        image.AddClass(className);
        return image;
    }

    function createAbilityImage(parent: Panel, ability: string, className: string): AbilityImage {
        const image = $.CreatePanel("DOTAAbilityImage", parent, "");
        image.abilityname = cardAbility(ability);
        image.AddClass(className);
        return image;
    }

    /** Scepter / Shard marks on a board ability, shown while Ctrl+Alt is held. */
    function createUpgradeBadges(frame: Panel, ability: NetworkedData<DraftPoolAbilityData>): void {
        const icons = [ability.scepter ? scepterIcon : "", ability.shard ? shardIcon : ""].filter(icon => icon !== "");
        if (icons.length === 0) return;
        const badges = createPanel("Panel", frame, "UpgradeBadges");
        badges.hittest = false;
        for (const icon of icons) {
            const image = createPanel("Image", badges, "UpgradeBadge") as ImagePanel;
            image.SetImage(icon);
            // Image scaling is a panel setting in Panorama, not a CSS property.
            image.SetScaling("stretch-to-fit-preserve-aspect");
            image.hittest = false;
        }
    }

    function createAbilityTile(parent: Panel, ability: NetworkedData<DraftPoolAbilityData>): Panel {
        const ultimate = Boolean(ability.ultimate);
        const frame = createPanel("Panel", parent, "AbilityFrame");
        frame.SetHasClass("Ultimate", ultimate);
        createAbilityImage(frame, ability.name, "BoardAbility");
        const bar = createPanel("Panel", frame, "PickerBar");
        createUpgradeBadges(frame, ability);
        frame.SetPanelEvent("onactivate", () => onBoardClick("ability", ability.name));
        showAbilityTooltip(frame, ability.name);
        boardEntries.set(ability.name, { frame, bar, kind: "ability", ultimate, hero: ability.hero });
        return frame;
    }

    function createSectionTitle(parent: Panel, token: string): void {
        (createPanel("Label", parent, "BoardSectionTitle") as LabelPanel).text = $.Localize(token);
    }

    /**
     * Like the official screen: the ultimates in their own block on top, then one card per pool hero
     * with its portrait (drafted as the base hero) and its standard abilities.
     */
    function buildBoard(): void {
        board.RemoveAndDeleteChildren();
        boardEntries.clear();
        previouslyTaken = new Set();
        if (pool === undefined) return;

        const abilities = toArray(pool.abilities as unknown as Record<string, NetworkedData<DraftPoolAbilityData>>);
        const heroes = toArray(pool.heroes as unknown as Record<string, string>);

        createSectionTitle(board, "#draft_section_ultimates");
        const ultimates = createPanel("Panel", board, "UltimatesRow");
        for (const hero of heroes) {
            for (const ability of abilities.filter(entry => entry.hero === hero && entry.ultimate)) {
                const tile = createAbilityTile(ultimates, ability);
                // Which hero the ultimate comes from (it counts toward that hero's limit).
                createHeroImage(tile, hero, "UltimateHeroBadge", "icon");
            }
        }

        // Rows built by hand (not a wrapping flow) so a short last row stays centered.
        createSectionTitle(board, "#draft_section_heroes");
        let cards = createPanel("Panel", board, "HeroCardsRow");
        heroes.forEach((hero, index) => {
            if (index > 0 && index % heroCardsPerRow === 0) cards = createPanel("Panel", board, "HeroCardsRow");
            const group = createPanel("Panel", cards, "HeroGroup");

            const heroFrame = createPanel("Panel", group, "HeroFrame");
            createHeroImage(heroFrame, hero, "HeroPortrait");
            const heroBar = createPanel("Panel", heroFrame, "PickerBar");
            heroFrame.SetPanelEvent("onactivate", () => onBoardClick("hero", hero));
            // Taken heroes show who took them as a body; their abilities stay on the board.
            const heroTag = createPanel("Label", heroFrame, "TakenTag") as LabelPanel;
            boardEntries.set(hero, {
                frame: heroFrame,
                bar: heroBar,
                tag: heroTag,
                kind: "hero",
                ultimate: false,
                hero,
            });

            const heroName = createPanel("Label", group, "HeroGroupName") as LabelPanel;
            heroName.text = $.Localize(`#${hero}`);

            const row = createPanel("Panel", group, "HeroAbilities");
            for (const ability of abilities.filter(entry => entry.hero === hero && !entry.ultimate)) {
                createAbilityTile(row, ability);
            }
        });
    }

    /** Restarts a one-shot CSS animation class. */
    function flash(panel: Panel, className: string): void {
        panel.RemoveClass(className);
        panel.AddClass(className);
    }

    function updateBoard(): void {
        const taken = takenBy();
        let newPick = false;
        const localTurn = activePlayer() === Players.GetLocalPlayer();
        for (const [name, entry] of boardEntries) {
            const picker = taken.get(name);
            const isTaken = picker !== undefined;
            if (isTaken && requestedBy.delete(name)) updateRequestDots(name);
            entry.frame.SetHasClass("Taken", isTaken);
            const pickable = !isTaken && canLocalPlayerPick(entry.kind, entry.ultimate, entry.hero);
            entry.frame.SetHasClass("Pickable", pickable);
            entry.frame.SetHasClass("Unavailable", localTurn && !isTaken && !pickable);
            entry.bar.style.backgroundColor = isTaken ? playerColor(picker) : "transparent";
            if (entry.tag !== undefined) {
                entry.tag.text = isTaken ? Players.GetPlayerName(picker) : "";
                // Strip across the bottom of the portrait in the picker's color, slightly see-through.
                entry.tag.style.backgroundColor = isTaken ? `${playerColor(picker)}e0` : "transparent";
            }

            if (primed && isTaken && !previouslyTaken.has(name)) {
                // Flash picks made since the last refresh.
                flash(entry.frame, "JustTaken");
                newPick = true;
            }
        }
        previouslyTaken = new Set(taken.keys());
        if (newPick) Game.EmitSound(pickSound);
    }

    interface AbilitySlot {
        slot: Panel;
        image: AbilityImage;
        /** Ability currently shown, read by the tooltip handler. */
        ability: string;
    }

    interface PlayerCard {
        card: Panel;
        heroName: LabelPanel;
        heroSlot: Panel;
        heroImage: HeroImage;
        regular: AbilitySlot[];
        ultimate: AbilitySlot;
    }

    /** Player cards are built once and updated in place: deleting a hovered panel leaves its tooltip stuck. */
    const playerCards = new Map<string, PlayerCard>();
    let playerCardsKey = "";

    // Usual hotkeys of the slots each pick ends up in, shown in empty slots as a hint.
    const regularSlotKeys = ["Q", "W", "E", "D", "F"];

    function createSlot(parent: Panel, extraClass: string, hint: string): Panel {
        const slot = createPanel("Panel", parent, "PickSlot");
        if (extraClass !== "") slot.AddClass(extraClass);
        (createPanel("Label", slot, "SlotHint") as LabelPanel).text = hint;
        return slot;
    }

    function createAbilitySlot(parent: Panel, extraClass: string, hint: string): AbilitySlot {
        const slot = createSlot(parent, extraClass, hint);
        const entry: AbilitySlot = { slot, image: createAbilityImage(slot, "", "SlotImage"), ability: "" };
        slot.SetPanelEvent("onmouseover", () => {
            if (entry.ability !== "") $.DispatchEvent("DOTAShowAbilityTooltip", slot, cardAbility(entry.ability));
        });
        slot.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideAbilityTooltip", slot));
        return entry;
    }

    function setAbilitySlot(entry: AbilitySlot, ability: string): void {
        if (entry.ability === ability) return;
        entry.ability = ability;
        entry.image.abilityname = ability === "" ? "" : cardAbility(ability);
        entry.slot.SetHasClass("Filled", ability !== "");
        if (primed && ability !== "") flash(entry.slot, "JustFilled");
    }

    function buildPlayerCards(ids: string[]): void {
        for (const column of Object.values(teamColumns)) column?.RemoveAndDeleteChildren();
        playerCards.clear();

        for (const id of ids) {
            const playerId = Number(id) as PlayerID;
            const column = teamColumns[players![id].team];
            if (column === undefined) continue;

            // Like the official screen: a big hero portrait ("?" until a hero is drafted) beside the
            // player's name and ability slots, on the outer side of each team's column.
            const card = createPanel("Panel", column, "PlayerCard");
            card.SetHasClass("LocalPlayer", playerId === Players.GetLocalPlayer());
            const dire = players![id].team === DOTATeam_t.DOTA_TEAM_BADGUYS;

            const heroSlot = $.CreatePanel("Panel", card, "");
            heroSlot.AddClass("CardPortrait");
            (createPanel("Label", heroSlot, "NoHeroMark") as LabelPanel).text = "?";
            const heroImage = createHeroImage(heroSlot, "", "CardHeroImage", "portrait");

            const info = createPanel("Panel", card, "CardInfo");
            if (dire) card.MoveChildBefore(info, heroSlot);

            const header = createPanel("Panel", info, "PlayerHeader");
            createPanel("Panel", header, "PlayerColor").style.backgroundColor = playerColor(playerId);
            const names = createPanel("Panel", header, "PlayerNames");
            (createPanel("Label", names, "PlayerName") as LabelPanel).text = Players.GetPlayerName(playerId);
            const heroName = createPanel("Label", names, "PlayerHeroName") as LabelPanel;

            const picks = createPanel("Panel", info, "PlayerPicks");

            const regular: AbilitySlot[] = [];
            for (let index = 0; index < (limits?.regularAbilities ?? 3); index++) {
                regular.push(createAbilitySlot(picks, "", regularSlotKeys[index] ?? ""));
            }
            const ultimate = createAbilitySlot(picks, "UltimateSlot", $.Localize("#draft_slot_ultimate"));

            playerCards.set(id, { card, heroName, heroSlot, heroImage, regular, ultimate });
        }
    }

    function updatePlayers(): void {
        if (players === undefined) return;

        const ids = Object.keys(players).sort((a, b) => Number(a) - Number(b));
        const key = ids.map(id => `${id}:${players![id].team}`).join(",");
        if (key !== playerCardsKey) {
            playerCardsKey = key;
            buildPlayerCards(ids);
        }

        const active = activePlayer();
        for (const [id, view] of playerCards) {
            const data = players[id];
            // Whose turn: the card lights up in that player's own color.
            const isActive = Number(id) === active;
            view.card.SetHasClass("ActiveTurn", isActive);
            const color = playerColor(Number(id) as PlayerID);
            view.card.style.border = isActive ? `3px solid ${color}` : null;
            view.card.style.backgroundColor = isActive
                ? `gradient(linear, 0% 0%, 100% 0%, from(${color}59), to(#11161ef2))`
                : null;

            view.heroName.text = $.Localize(data.hero !== "" ? `#${data.hero}` : "#draft_no_hero");
            if (view.heroImage.heroname !== data.hero) {
                view.heroImage.heroname = data.hero;
                if (primed && data.hero !== "") flash(view.heroSlot, "JustFilled");
            }
            view.heroSlot.SetHasClass("Filled", data.hero !== "");

            const regular = abilitiesOf(data);
            view.regular.forEach((entry, index) => setAbilitySlot(entry, regular[index] ?? ""));
            setAbilitySlot(view.ultimate, data.ultimate);
        }
    }

    /** One pick in the order strip: the player's Steam avatar. */
    function addOrderSlot(playerId: PlayerID): Panel {
        const slot = createPanel("Panel", pickOrder, "OrderSlot");
        slot.SetHasClass("Local", playerId === Players.GetLocalPlayer());
        // Always the player's Steam avatar (who picks), or "?" for bots, which have no Steam ID.
        const steamId = Game.GetPlayerInfo(playerId)?.player_steamid ?? "0";
        if (steamId !== "0" && steamId !== "") {
            const avatar = $.CreatePanel("DOTAAvatarImage", slot, "");
            avatar.AddClass("OrderSlotHero");
            avatar.steamid = steamId;
        } else {
            slot.style.backgroundColor = `${playerColor(playerId)}40`;
            (createPanel("Label", slot, "OrderSlotUnknown") as LabelPanel).text = "?";
        }
        createPanel("Panel", slot, "OrderSlotColor").style.backgroundColor = playerColor(playerId);
        slot.SetPanelEvent("onmouseover", () =>
            $.DispatchEvent("DOTAShowTextTooltip", slot, Players.GetPlayerName(playerId)),
        );
        slot.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideTextTooltip", slot));
        return slot;
    }

    function addRoundBadge(round: number): void {
        (createPanel("Label", pickOrder, "OrderRoundBadge") as LabelPanel).text = String(round);
    }

    /**
     * Pick order as one strip of slots, like the official screen: a round badge, that round's picks
     * (finished ones dimmed, the current one larger), then the next round, which goes the other way.
     * Below it, how many picks until the local player's turn.
     */
    function updatePickOrder(): void {
        pickOrder.RemoveAndDeleteChildren();
        nextTurnLabel.text = "";
        if (state === undefined || state.phase === "waiting" || state.phase === "done") return;

        const order = currentOrder();
        const picking = state.phase === "picking";
        // During planning nothing is picked yet and "order" is round 1; during a break the round just ended.
        const round = state.phase === "planning" ? 1 : state.round;
        const turn = picking ? state.turn : state.phase === "planning" ? -1 : order.length;

        addRoundBadge(round);
        order.forEach((playerId, index) => {
            const slot = addOrderSlot(playerId);
            slot.SetHasClass("Current", picking && index === turn);
            slot.SetHasClass("Done", index < turn);
        });

        const next = round < state.rounds ? [...order].reverse() : [];
        if (next.length > 0) {
            addRoundBadge(round + 1);
            for (const playerId of next) addOrderSlot(playerId).AddClass("Upcoming");
        }

        const local = Players.GetLocalPlayer();
        const upcoming = [...order.slice(turn + 1), ...next];
        const picksAway = upcoming.indexOf(local);
        nextTurnLabel.SetHasClass("Soon", picksAway === 0);
        if (picksAway >= 0 && !(picking && order[turn] === local)) {
            nextTurnLabel.SetDialogVariableInt("picks", picksAway + 1);
            nextTurnLabel.text = $.Localize(
                picksAway === 0 ? "#draft_next_turn_one" : "#draft_next_turn",
                nextTurnLabel,
            );
        }
    }

    /** Big "Your turn" banner for a moment when the local player's turn starts. */
    function showYourTurnToast(): void {
        yourTurnToast.AddClass("Visible");
        Game.EmitSound(yourTurnSound);
        $.Schedule(1.6, () => yourTurnToast.RemoveClass("Visible"));
    }

    function updateLegend(): void {
        const perHero = limits?.maxAbilitiesPerHero ?? 0;
        legend.SetDialogVariableInt("per_hero", perHero);
        legend.text = $.Localize(perHero > 0 ? "#draft_legend_limit" : "#draft_legend", legend);
    }

    function updateHeader(): void {
        const phase = state?.phase ?? "waiting";
        root.SetHasClass("Hidden", phase === "done");

        if (phase === "picking" || phase === "break") {
            phaseLabel.SetDialogVariableInt("round", state!.round);
            phaseLabel.SetDialogVariableInt("rounds", state!.rounds);
            phaseLabel.text = $.Localize("#draft_round", phaseLabel);
        } else {
            phaseLabel.text = $.Localize(`#draft_phase_${phase}`);
        }

        const active = activePlayer();
        const localTurn = active !== undefined && active === Players.GetLocalPlayer();
        root.SetHasClass("LocalTurn", localTurn);
        if (localTurn && !wasLocalTurn && primed) showYourTurnToast();
        wasLocalTurn = localTurn;
        if (phase === "planning") {
            turnLabel.text = $.Localize("#draft_planning_hint");
        } else if (phase === "break") {
            turnLabel.text = $.Localize("#draft_phase_break");
        } else if (localTurn) {
            turnLabel.text = $.Localize("#draft_your_turn");
        } else if (active !== undefined) {
            turnLabel.SetDialogVariable("player", Players.GetPlayerName(active));
            turnLabel.text = $.Localize("#draft_turn_of", turnLabel);
        } else {
            turnLabel.text = "";
        }
    }

    function tickTimer(): void {
        const active = state !== undefined && state.phase !== "waiting" && state.phase !== "done";
        const remaining = active ? Math.max(0, state!.endsAt - Game.GetGameTime()) : 0;
        timerLabel.text = active ? String(Math.ceil(remaining)) : "";
        root.SetHasClass("Urgent", state?.phase === "picking" && remaining <= 3);

        // Ring that empties with the time left. A screen loaded mid-pick starts it full.
        const key = active ? `${state!.phase}:${state!.round}:${state!.turn}:${state!.endsAt}` : "";
        if (key !== timerKey) {
            timerKey = key;
            timerDuration = Math.max(remaining, 0.1);
        }
        const fraction = active ? Math.min(1, remaining / timerDuration) : 0;
        timerProgress.style.clip = `radial(50% 50%, 0deg, ${(fraction * 360).toFixed(1)}deg)`;

        // Scepter / Shard marks on the board while Ctrl+Alt is held.
        root.SetHasClass("ShowUpgrades", GameUI.IsControlDown() && GameUI.IsAltDown());

        closeStaleTooltip();
        $.Schedule(0.1, tickTimer);
    }

    function refresh(): void {
        closeStaleTooltip();
        updateLegend();
        updateHeader();
        updatePickOrder();
        updatePlayers();
        updateBoard();
        if (players !== undefined) primed = true;
    }

    function load(): void {
        state = CustomNetTables.GetTableValue("draft", "state") ?? undefined;
        players = CustomNetTables.GetTableValue("draft", "players") ?? undefined;
        limits = CustomNetTables.GetTableValue("draft", "limits") ?? undefined;
        // The pool is set once per draft; rebuild the board only when it actually changes.
        const newPool = CustomNetTables.GetTableValue("draft", "pool") ?? undefined;
        const newPoolKey = JSON.stringify(newPool ?? null);
        if (newPoolKey !== poolKey) {
            pool = newPool;
            poolKey = newPoolKey;
            buildBoard();
        }
        refresh();
    }

    // Tools only: skip the draft with random picks (the server ignores it outside tools).
    const devSkipDraft = $("#DevSkipDraft");
    devSkipDraft.visible = Game.IsInToolsMode();
    devSkipDraft.SetPanelEvent("onactivate", () => GameEvents.SendCustomGameEventToServer("dev_skip_draft", {}));

    // Dota's own hero picker sits under this screen; hide the parts that would show through.
    for (const element of [
        DotaDefaultUIElement_t.DOTA_DEFAULT_UI_HERO_SELECTION_TEAMS,
        DotaDefaultUIElement_t.DOTA_DEFAULT_UI_HERO_SELECTION_GAME_NAME,
        DotaDefaultUIElement_t.DOTA_DEFAULT_UI_HERO_SELECTION_CLOCK,
        DotaDefaultUIElement_t.DOTA_DEFAULT_UI_HERO_SELECTION_HEADER,
    ]) {
        GameUI.SetDefaultUIEnabled(element, false);
    }

    CustomNetTables.SubscribeNetTableListener("draft", () => load());
    load();
    tickTimer();
})();
