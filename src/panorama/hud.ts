// In-game HUD: F8 reorder mode, where players drag their abilities onto each other in a panel (Dota's
// own ability bar is drawn above custom UI, so it cannot be reordered in place). Changes are previewed
// and only sent to the server on "Apply".
// Wrapped in a function so its names do not leak into the other Panorama scripts.
(() => {
    const hud = $.GetContextPanel();
    const reorderHint = $("#ReorderHint");
    const reorderSlots = $("#ReorderSlots");

    // Every hotkeyed slot, R included: players put any ability on any key. Hidden slots are skipped.
    // The same list is checked by the server.
    const reorderableSlots = [
        { index: 0, key: "Q" },
        { index: 1, key: "W" },
        { index: 2, key: "E" },
        { index: 3, key: "D" },
        { index: 4, key: "F" },
        { index: 5, key: "R" },
    ];

    let reorderMode = false;
    /** Hero slot indices being reordered, in bar order. */
    let slots: number[] = [];
    /** Ability names currently in those slots on the hero. */
    let current: string[] = [];
    /** Previewed order. */
    let preview: string[] = [];
    /** Position being dragged, if any. */
    let dragFrom: number | undefined;

    function localHero(): EntityIndex {
        return Players.GetPlayerHeroEntityIndex(Players.GetLocalPlayer());
    }

    function readHeroLayout(): void {
        slots = [];
        current = [];
        const hero = localHero();
        // Innates have their own HUD button; the server lists them for each built hero.
        const upgrades = CustomNetTables.GetTableValue("draft", "upgrades")?.[String(Players.GetLocalPlayer())];
        const innates = Object.values((upgrades?.innates ?? {}) as Record<string, string>);
        if (hero !== -1) {
            for (const { index } of reorderableSlots) {
                const ability = Entities.GetAbility(hero, index);
                // Only what the ability bar shows: skips hidden slots and innates (they have their own button).
                if (ability === -1 || Abilities.IsHidden(ability) || !Abilities.IsDisplayedAbility(ability)) continue;
                if (innates.includes(Abilities.GetAbilityName(ability))) continue;
                slots.push(index);
                current.push(Abilities.GetAbilityName(ability));
            }
        }
        preview = [...current];
    }

    function panelPath(panel: Panel): string {
        const ids: string[] = [];
        for (let node: Panel | null = panel; node !== null; node = node.GetParent())
            ids.unshift(node.id || node.paneltype);
        return ids.join(" > ");
    }

    function keyOf(slot: number): string {
        return reorderableSlots.find(entry => entry.index === slot)?.key ?? "";
    }

    /** Drag an ability onto another to swap them in the preview. */
    function makeDraggable(frame: Panel, ability: string, position: number): void {
        frame.SetDraggable(true);

        $.RegisterEventHandler("DragStart", frame, (_, settings) => {
            dragFrom = position;
            $.DispatchEvent("DOTAHideAbilityTooltip", frame);
            // The icon that follows the cursor; deleted when the drag ends.
            const ghost = $.CreatePanel("DOTAAbilityImage", hud, "");
            ghost.AddClass("ReorderDragGhost");
            ghost.abilityname = ability;
            settings.displayPanel = ghost;
            settings.offsetX = 30;
            settings.offsetY = 30;
            settings.removePositionBeforeDrop = false;
            frame.AddClass("Dragging");
            return true;
        });
        $.RegisterEventHandler("DragEnter", frame, () => {
            if (dragFrom !== undefined && dragFrom !== position) frame.AddClass("DropTarget");
            return true;
        });
        $.RegisterEventHandler("DragLeave", frame, () => {
            frame.RemoveClass("DropTarget");
            return true;
        });
        $.RegisterEventHandler("DragDrop", frame, () => {
            // Only update the preview here: redrawing now would delete the dragged panel before its
            // DragEnd fires. DragEnd redraws.
            if (dragFrom !== undefined && dragFrom !== position) {
                [preview[dragFrom], preview[position]] = [preview[position], preview[dragFrom]];
            }
            return true;
        });
        $.RegisterEventHandler("DragEnd", frame, (_, dragged) => {
            dragged.DeleteAsync(0);
            dragFrom = undefined;
            render();
            return true;
        });
    }

    function createAbilityFrame(parent: Panel, ability: string, position: number): Panel {
        // The frame takes the hover and the drag; Dota's ability image handles its own mouse events.
        const frame = $.CreatePanel("Panel", parent, "");
        frame.AddClass("ReorderFrame");
        frame.SetHasClass("Changed", ability !== current[position]);
        const image = $.CreatePanel("DOTAAbilityImage", frame, "");
        image.AddClass("ReorderAbility");
        image.hittest = false;
        image.abilityname = ability;
        frame.SetPanelEvent("onmouseover", () => {
            if (dragFrom === undefined) $.DispatchEvent("DOTAShowAbilityTooltip", frame, ability);
        });
        frame.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideAbilityTooltip", frame));
        makeDraggable(frame, ability, position);
        return frame;
    }

    /** The abilities in the panel, dragged onto each other. */
    function renderInPanel(): void {
        preview.forEach((ability, position) => {
            const slot = $.CreatePanel("Panel", reorderSlots, "");
            slot.AddClass("ReorderSlot");
            slot.SetHasClass("Changed", ability !== current[position]);
            const key = $.CreatePanel("Label", slot, "");
            key.AddClass("ReorderKey");
            key.text = keyOf(slots[position]);
            createAbilityFrame(slot, ability, position);
            const name = $.CreatePanel("Label", slot, "");
            name.AddClass("ReorderName");
            name.text = $.Localize(`#DOTA_Tooltip_ability_${ability}`);
        });
    }

    function render(): void {
        reorderSlots.RemoveAndDeleteChildren();
        renderInPanel();
        hud.SetHasClass(
            "ReorderChanged",
            preview.some((ability, position) => ability !== current[position]),
        );
    }

    /** Sends the new order. */
    function apply(): void {
        // The server checks the whole order and computes the swaps itself.
        GameEvents.SendCustomGameEventToServer("ability_reorder", { slots, abilities: preview });
        setReorderMode(false);
    }

    function setReorderMode(enabled: boolean): void {
        reorderMode = enabled;
        dragFrom = undefined;
        $.DispatchEvent("DOTAHideAbilityTooltip", hud);
        hud.SetHasClass("ReorderMode", enabled);
        if (enabled) {
            readHeroLayout();
            render();
        }
    }

    function toggle(): void {
        setReorderMode(!reorderMode);
    }

    // Registered before the rest of the setup, so an error further down cannot leave F8 dead.
    // Tools only: dev panel. Each button sends a "dev_action" the server handles in tools only.
    const devPanel = $("#DevPanel");
    const devButtons = $("#DevButtons");
    devPanel.visible = Game.IsInToolsMode();
    const devActions: [string, string][] = [
        ["level6", "Level 6"],
        ["level30", "Level 30"],
        ["gold", "+5000 gold"],
        ["refresh", "Refresh"],
        ["scepter", "Scepter"],
        ["shard", "Shard"],
        ["respawn", "Respawn"],
        ["dummy", "Enemy dummy"],
    ];
    devButtons.RemoveAndDeleteChildren();
    for (const [action, text] of devActions) {
        const button = $.CreatePanel("TextButton", devButtons, "");
        button.AddClass("DevButton");
        button.text = text;
        button.SetPanelEvent("onactivate", () => GameEvents.SendCustomGameEventToServer("dev_action", { action }));
    }
    $("#DevPanelToggle").SetPanelEvent("onactivate", () => devPanel.ToggleClass("Open"));

    // Console commands outlive this script: they survive hot reloads and map reloads, and a name can
    // only be registered once. Each load registers its own command and points F8 at it, so F8 always
    // reaches the live script.
    const command = `TurboAbilityDraftReorder${Date.now()}`;
    Game.AddCommand(command, toggle, "", 0);
    Game.CreateCustomKeyBind("F8", command);

    $("#ReorderApply").SetPanelEvent("onactivate", apply);
    $("#ReorderCancel").SetPanelEvent("onactivate", () => setReorderMode(false));
    $("#ReorderReset").SetPanelEvent("onactivate", () => {
        preview = [...current];
        render();
    });
    reorderHint.SetPanelEvent("onactivate", toggle);
    reorderHint.SetPanelEvent("onmouseover", () =>
        $.DispatchEvent("DOTAShowTextTooltip", reorderHint, $.Localize("#hud_reorder_hint")),
    );
    reorderHint.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideTextTooltip", reorderHint));

    // Aghanim's tooltip. Dota's HUD describes the base hero's Scepter/Shard upgrades, which is wrong for a
    // drafted hero; an invisible panel over Dota's indicator shows which drafted abilities they upgrade.
    const aghsOverlay = $("#AghsOverlay");
    let aghsLogged = false;

    function findAghsIndicator(): Panel | undefined {
        let top: Panel = hud;
        while (top.GetParent() !== null) top = top.GetParent()!;
        const lowerHud = top.FindChildTraverse("lower_hud");
        if (lowerHud === null) return undefined;
        const matches: Panel[] = [];
        const queue: Panel[] = [lowerHud];
        while (queue.length > 0) {
            const panel = queue.shift()!;
            if (/aghs/i.test(panel.id) && panel.visible && panel.actuallayoutwidth > 0) matches.push(panel);
            queue.push(...panel.Children());
        }
        if (!aghsLogged) {
            aghsLogged = true;
            $.Msg(`[aghs] candidates: ${matches.map(panelPath).join(" | ")}`);
        }
        // The outermost match is the whole indicator (scepter and shard).
        return matches[0];
    }

    const aghsTooltip = $("#AghsTooltip");
    const aghsTooltipArrow = $("#AghsTooltipArrow");
    // Must match #AghsTooltip / #AghsTooltipArrow in hud.css.
    const aghsTooltipWidth = 400;
    const aghsArrowSize = 14;
    const aghsTooltipGap = 10;

    /**
     * Localized ability text with its %value% placeholders filled from the hero's own ability, like
     * Dota's tooltips ("%radius%" -> 225, "%bonus_pct%%" -> 25%).
     */
    /** A value as Dota prints it: no float noise (0.30000001 -> 0.3). */
    function formatValue(value: number): string {
        return String(Math.round(value * 100) / 100);
    }

    /**
     * The first of these localization tokens that exists, with its %value% placeholders filled from the
     * hero's own ability, like Dota's tooltips ("%radius%" -> 225, "%bonus_pct%%" -> 25%). Uses the
     * current level, or level 1 while the ability is not learned.
     */
    function describe(tokens: string[], ability: string): string {
        const hero = localHero();
        const entity = hero === -1 ? -1 : Entities.GetAbilityByName(hero, ability);
        const level = entity === -1 ? 0 : Math.max(Abilities.GetLevel(entity), 1) - 1;
        for (const token of tokens) {
            const text = $.Localize(token);
            if (text === token || text === token.substring(1)) continue;
            return text.replace(/%(\w*)%/g, (_, key: string) => {
                if (key === "") return "%";
                return entity === -1 ? "?" : formatValue(Abilities.GetLevelSpecialValueFor(entity, key, level));
            });
        }
        return "";
    }

    function addAghsSection(item: "scepter" | "shard", entries: DraftUpgradeEntry[]): void {
        const section = $.CreatePanel("Panel", aghsTooltip, "");
        section.AddClass("AghsSection");
        section.AddClass(item === "scepter" ? "Scepter" : "Shard");
        const header = $.CreatePanel("Panel", section, "");
        header.AddClass("AghsHeader");
        const itemIcon = $.CreatePanel("DOTAItemImage", header, "");
        itemIcon.AddClass("AghsItemIcon");
        itemIcon.itemname = item === "scepter" ? "item_ultimate_scepter" : "item_aghanims_shard";
        const title = $.CreatePanel("Label", header, "");
        title.AddClass("AghsTitle");
        title.text = $.Localize(`#hud_aghs_${item}`);

        if (entries.length === 0) {
            const none = $.CreatePanel("Label", section, "");
            none.AddClass("AghsNone");
            none.text = $.Localize("#hud_aghs_none");
            return;
        }
        for (const entry of entries) {
            const row = $.CreatePanel("Panel", section, "");
            row.AddClass("AghsEntry");
            const iconFrame = $.CreatePanel("Panel", row, "");
            iconFrame.AddClass("AghsIconFrame");
            const icon = $.CreatePanel("DOTAAbilityImage", iconFrame, "");
            icon.AddClass("AghsIcon");
            icon.abilityname = entry.ability;
            const text = $.CreatePanel("Panel", row, "");
            text.AddClass("AghsText");
            const name = $.CreatePanel("Label", text, "");
            name.AddClass("AghsName");
            name.text = $.Localize(`#DOTA_Tooltip_ability_${entry.ability}`);
            const tag = $.CreatePanel("Label", text, "");
            tag.AddClass("AghsTag");
            tag.SetHasClass("New", entry.kind === "new");
            tag.text = $.Localize(entry.kind === "new" ? "#hud_aghs_new" : "#hud_aghs_upgrade");
            // An upgrade has its own "<ability>_<item>_description"; a granted ability (or an upgrade
            // without its own text) falls back to the ability's description.
            const base = `#DOTA_Tooltip_ability_${entry.ability}`;
            const tokens =
                entry.kind === "new" ? [`${base}_Description`] : [`${base}_${item}_description`, `${base}_Description`];
            const description = $.CreatePanel("Label", text, "");
            description.AddClass("AghsDescription");
            description.html = true;
            description.text = describe(tokens, entry.ability);
        }
    }

    /** Builds the tooltip, Dota-style: per item, each affected ability with icon, tag and description. */
    function showAghsTooltip(anchor: Panel): void {
        aghsTooltip.RemoveAndDeleteChildren();
        const upgrades = CustomNetTables.GetTableValue("draft", "upgrades")?.[String(Players.GetLocalPlayer())];
        // Entries are { ability, kind }; a server from before that change sent plain names, which can
        // happen right after a hot reload of this script, so accept both.
        const list = (data: unknown): DraftUpgradeEntry[] =>
            Object.values((data ?? {}) as Record<string, unknown>).map(entry =>
                typeof entry === "string" ? { ability: entry, kind: "upgrade" } : (entry as DraftUpgradeEntry),
            );
        addAghsSection("scepter", list(upgrades?.scepter));
        addAghsSection("shard", list(upgrades?.shard));

        // Above the indicator, its right edge lined up with the indicator's.
        const position = layoutPosition(anchor);
        const base = layoutPosition(aghsOverlay);
        if (position !== undefined && base !== undefined) {
            const scaleX = aghsOverlay.actualuiscale_x;
            const left = (position.x - base.x) / scaleX;
            const width = anchor.actuallayoutwidth / scaleX;
            aghsTooltip.style.x = `${left + width - aghsTooltipWidth}px`;
            // Bottom-anchored: move it up from the screen bottom to just above the indicator.
            const overlayHeight = aghsOverlay.actuallayoutheight / aghsOverlay.actualuiscale_y;
            const top = (position.y - base.y) / aghsOverlay.actualuiscale_y;
            aghsTooltip.style.y = `${top - overlayHeight - aghsTooltipGap}px`;
            // Pointer: a rotated square centred on the tooltip's bottom edge, above the indicator.
            aghsTooltipArrow.style.x = `${left + width / 2 - aghsArrowSize / 2}px`;
            aghsTooltipArrow.style.y = `${top - aghsTooltipGap - aghsArrowSize / 2}px`;
            aghsTooltipArrow.AddClass("Visible");
        }
        aghsTooltip.AddClass("Visible");
    }

    /** A panel's window position, or undefined while it is not laid out (Dota returns huge numbers). */
    function layoutPosition(panel: Panel): { x: number; y: number } | undefined {
        const position = panel.GetPositionWithinWindow();
        const valid = (value: number) => Number.isFinite(value) && Math.abs(value) < 100000;
        return valid(position.x) && valid(position.y) ? position : undefined;
    }

    /** Keeps the hover area on top of Dota's indicator; the HUD can move or rebuild it. */
    function updateAghsOverlay(): void {
        $.Schedule(1, updateAghsOverlay);
        const indicator = findAghsIndicator();
        const origin = indicator === undefined ? undefined : layoutPosition(indicator);
        const base = layoutPosition(aghsOverlay);
        if (indicator === undefined || origin === undefined || base === undefined) {
            aghsOverlay.RemoveAndDeleteChildren();
        } else {
            let hover = aghsOverlay.GetChild(0);
            if (hover === null) {
                hover = $.CreatePanel("Panel", aghsOverlay, "");
                hover.AddClass("AghsHover");
                const area = hover;
                area.SetPanelEvent("onmouseover", () => showAghsTooltip(area));
                area.SetPanelEvent("onmouseout", () => {
                    aghsTooltip.RemoveClass("Visible");
                    aghsTooltipArrow.RemoveClass("Visible");
                });
            }
            hover.style.x = `${(origin.x - base.x) / aghsOverlay.actualuiscale_x}px`;
            hover.style.y = `${(origin.y - base.y) / aghsOverlay.actualuiscale_y}px`;
            hover.style.width = `${indicator.actuallayoutwidth / aghsOverlay.actualuiscale_x}px`;
            hover.style.height = `${indicator.actuallayoutheight / aghsOverlay.actualuiscale_y}px`;
        }
    }

    updateAghsOverlay();
})();
