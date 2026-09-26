var _stretchLastError = "";
function _aeActiveComp() {
    var item = app.project ? app.project.activeItem : null;
    return (item && item instanceof CompItem) ? item : null;
}

function _aeSafeInt(v, d) {
    var n = parseInt(v, 10);
    return isNaN(n) ? d : n;
}

function _aeSafeFloat(v, d) {
    var n = parseFloat(v);
    return isNaN(n) ? d : n;
}

function _clamp(n, min, max) {
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

function _unescapeJSONString(str) {
    if (str === null || str === undefined) return "";
    var s = "" + str;
    s = s.replace(/\\n/g, "\n");
    s = s.replace(/\\r/g, "\r");
    s = s.replace(/\\"/g, '"');
    s = s.replace(/\\\\/g, "\\");
    return s;
}

function _escapeJSONValue(value) {
    var s = "" + (value === null || value === undefined ? "" : value);
    s = s.replace(/\\/g, "\\\\");
    s = s.replace(/"/g, '\\"');
    s = s.replace(/\r/g, "\\r");
    s = s.replace(/\n/g, "\\n");
    return s;
}

function _audioInfoToJson(info) {
    if (!info) return "{}";
    return "{"
        + "\"layerIndex\":" + _aeSafeInt(info.layerIndex, 0) + ","
        + "\"layerName\":\"" + _escapeJSONValue(info.layerName) + "\","
        + "\"selectionSource\":\"" + _escapeJSONValue(info.selectionSource) + "\","
        + "\"inPointSec\":" + _aeSafeFloat(info.inPointSec, 0) + ","
        + "\"outPointSec\":" + _aeSafeFloat(info.outPointSec, 0) + ","
        + "\"startTimeSec\":" + _aeSafeFloat(info.startTimeSec, 0) + ","
        + "\"layerDurationSec\":" + _aeSafeFloat(info.layerDurationSec, 0) + ","
        + "\"sourceDurationSec\":" + _aeSafeFloat(info.sourceDurationSec, 0) + ","
        + "\"sourceOffsetAtLayerInSec\":" + _aeSafeFloat(info.sourceOffsetAtLayerInSec, 0) + ","
        + "\"mediaPath\":\"" + _escapeJSONValue(info.mediaPath) + "\""
        + "}";
}

function _parseStringArrayJson(jsonStr) {
    if (!jsonStr || jsonStr === "" || jsonStr === "[]") return [];

    try {
        if (typeof JSON !== "undefined" && JSON.parse) {
            var parsed = JSON.parse(jsonStr);
            if (parsed instanceof Array) {
                var out = [];
                for (var i = 0; i < parsed.length; i++) out.push("" + parsed[i]);
                return out;
            }
        }
    } catch (e) {}

    var trimmed = ("" + jsonStr).replace(/^\s*\[/, "").replace(/\]\s*$/, "");
    if (!trimmed.length) return [];

    var parts = trimmed.split(",");
    var out2 = [];
    for (var p = 0; p < parts.length; p++) {
        var token = parts[p].replace(/^\s*"/, "").replace(/"\s*$/, "");
        out2.push(_unescapeJSONString(token));
    }
    return out2;
}

function _getSelectedLayers(comp) {
    if (!comp) return [];
    try { return comp.selectedLayers || []; } catch (e) { return []; }
}

function _getTargetClipLayers(comp) {
    var sel = _getSelectedLayers(comp);
    if (!sel || sel.length === 0) return [];

    var clips = [];
    for (var i = 0; i < sel.length; i++) {
        var lyr = sel[i];
        try {
            if ((lyr instanceof AVLayer) && !lyr.nullLayer && !lyr.adjustmentLayer) {
                clips.push(lyr);
            }
        } catch (e) {}
    }

    if (clips.length === 0) {
        for (var j = 0; j < sel.length; j++) clips.push(sel[j]);
    }

    clips.sort(function (a, b) { return a.index - b.index; });
    return clips;
}

function _deselectAll(comp) {
    if (!comp) return;
    for (var i = 1; i <= comp.numLayers; i++) {
        try { comp.layer(i).selected = false; } catch (e) {}
    }
}

function _versionInfo() {
    var info = { major: 0, year: 0 };
    try {
        var majorStr = (app.version || "").split(".")[0];
        info.major = parseInt(majorStr, 10);
    } catch (e) {
        info.major = 0;
    }
    if (!isNaN(info.major) && info.major > 0) {
        info.year = (info.major < 100) ? (2000 + info.major) : info.major;
    }
    return info;
}

function _pushUniquePath(paths, path) {
    if (!path || !path.length) return;
    var key = path.toLowerCase();
    for (var i = 0; i < paths.length; i++) {
        if (paths[i].toLowerCase() === key) return;
    }
    paths.push(path);
}

var _userPresetsFolderOverride = "";

function _folderFromPath(pathStr) {
    if (!pathStr) return null;
    try {
        var f = new Folder(pathStr);
        if (f.exists) return f;
    } catch (e) {}
    return null;
}

function setUserPresetsFolder(pathStr) {
    try {
        var p = _unescapeJSONString(pathStr || "");
        if (!p || !p.length) {
            _userPresetsFolderOverride = "";
            return "";
        }
        var folder = _folderFromPath(p);
        if (!folder) return "Error: Selected folder does not exist.";
        _userPresetsFolderOverride = folder.fsName;
        return _userPresetsFolderOverride;
    } catch (e) {
        return "Error: " + e.toString();
    }
}

function browseUserPresetsFolder() {
    try {
        var picked = Folder.selectDialog("Select After Effects User Presets Folder");
        if (!picked) return "";
        _userPresetsFolderOverride = picked.fsName;
        return _userPresetsFolderOverride;
    } catch (e) {
        return "Error: " + e.toString();
    }
}

function _addPortablePresetCandidates(paths) {
    var docs = "";
    try { docs = Folder.myDocuments.fsName; } catch (e) {}
    var userProfile = "";
    try { userProfile = $.getenv("USERPROFILE"); } catch (eUp) {}

    var info = _versionInfo();
    var majorStr = (info.major > 0) ? ("" + info.major) : "";
    var yearStr = (info.year > 0) ? ("" + info.year) : "";

    var bases = [];
    if (docs && docs.length) {
        _pushUniquePath(bases, docs);
        _pushUniquePath(bases, docs + "/Adobe");
        _pushUniquePath(bases, docs + "/Adobe.localized");
    }
    if (userProfile && userProfile.length) {
        _pushUniquePath(bases, userProfile + "/OneDrive/Documents");
        _pushUniquePath(bases, userProfile + "/OneDrive/Dokumenter");
        _pushUniquePath(bases, userProfile + "/Documents");
        _pushUniquePath(bases, userProfile + "/Dokumenter");
    }

    for (var b = 0; b < bases.length; b++) {
        var base = bases[b];

        if (majorStr) _pushUniquePath(paths, base + "/After Effects " + majorStr + "/User Presets");
        if (yearStr) _pushUniquePath(paths, base + "/After Effects " + yearStr + "/User Presets");
        _pushUniquePath(paths, base + "/After Effects/User Presets");
        _pushUniquePath(paths, base + "/After Effects.localized/User Presets");
        if (yearStr) _pushUniquePath(paths, base + "/After Effects.localized " + yearStr + "/User Presets");
        if (majorStr) _pushUniquePath(paths, base + "/After Effects.localized " + majorStr + "/User Presets");

        if (majorStr) _pushUniquePath(paths, base + "/After Effects " + majorStr + "/User Presets");
        if (yearStr) _pushUniquePath(paths, base + "/After Effects " + yearStr + "/User Presets");
        _pushUniquePath(paths, base + "/After Effects/User Presets");

        _pushUniquePath(paths, base + "/After Effects.localized/User Presets");
        if (yearStr) _pushUniquePath(paths, base + "/After Effects.localized " + yearStr + "/User Presets");
        if (majorStr) _pushUniquePath(paths, base + "/After Effects.localized " + majorStr + "/User Presets");

        try {
            var f = new Folder(base);
            if (f.exists) {
                var children = f.getFiles();
                for (var i = 0; i < children.length; i++) {
                    var child = children[i];
                    if (child instanceof Folder) {
                        var nm = (child.name || "").toLowerCase();
                        if (nm.indexOf("after effects") !== -1) {
                            _pushUniquePath(paths, child.fsName + "/User Presets");
                        }
                    }
                }
            }
        } catch (eScan) {}
    }
}

function _findBestUserPresetsFolder() {
    if (_userPresetsFolderOverride && _userPresetsFolderOverride.length) {
        var chosen = _folderFromPath(_userPresetsFolderOverride);
        if (chosen) return chosen;
    }

    var candidatePaths = [];

    _addPortablePresetCandidates(candidatePaths);

    for (var i = 0; i < candidatePaths.length; i++) {
        try {
            var f = new Folder(candidatePaths[i]);
            if (f.exists) return f;
        } catch (e2) {}
    }

    // Fallback only if no user-level presets folder was found.
    try {
        var scriptFolder = File($.fileName).parent;
        var localFolder = new Folder(scriptFolder.fsName + "/presets");
        if (localFolder.exists) return localFolder;
    } catch (e0) {}

    return null;
}

function _getUserPresetsRoot(optionalFolderPath) {
    var p = _unescapeJSONString(optionalFolderPath || "");
    if (p && p.length) {
        var f = _folderFromPath(p);
        if (!f) return null;
        _userPresetsFolderOverride = f.fsName;
        return f;
    }
    return _findBestUserPresetsFolder();
}

function _scanPresetsRecursive(folder, bucket, rootPath) {
    var files;
    try { files = folder.getFiles(); } catch (e) { return; }
    if (!files) return;

    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (f instanceof Folder) {
            _scanPresetsRecursive(f, bucket, rootPath);
        } else if (f instanceof File) {
            var nm = f.name.toLowerCase();
            if (nm.length >= 4 && nm.substr(nm.length - 4) === ".ffx") {
                var display = f.displayName || f.name;
                if (display.length > 4) display = display.substr(0, display.length - 4);

                var group = "User";
                try {
                    var rel = f.parent.fsName.substr(rootPath.length);
                    rel = rel.replace(/^[\\\/]+/, "");
                    if (rel && rel.length) group = rel;
                } catch (e2) {}

                bucket.push({ name: display, path: f.fsName, group: group });
            }
        }
    }
}

function _getAllUserPresets(optionalFolderPath) {
    var folder = _getUserPresetsRoot(optionalFolderPath);
    if (!folder) return [];

    var all = [];
    _scanPresetsRecursive(folder, all, folder.fsName);

    all.sort(function (a, b) {
        var ag = (a.group || "").toLowerCase();
        var bg = (b.group || "").toLowerCase();
        if (ag < bg) return -1;
        if (ag > bg) return 1;

        var an = (a.name || "").toLowerCase();
        var bn = (b.name || "").toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        return 0;
    });

    return all;
}

function listUserPresets(optionalFolderPath) {
    try {
      var presets = _getAllUserPresets(optionalFolderPath);
      var out = [];
      for (var i = 0; i < presets.length; i++) {
        out.push({
          id: "preset-" + i,
          name: presets[i].name,
          category: presets[i].group,
          path: presets[i].path
        });
      }
      if (typeof JSON !== "undefined" && JSON.stringify) return JSON.stringify(out);
      return "[]";
    } catch (e) {
      return "Error: " + e.toString();
    }
}

function _findPresetPathsByNames(names) {
    var out = [];
    if (!names || names.length === 0) return out;

    var all = _getAllUserPresets();
    if (!all || all.length === 0) return out;

    var lookup = {};
    for (var i = 0; i < all.length; i++) {
        lookup[(all[i].name || "").toLowerCase()] = all[i].path;
    }

    for (var n = 0; n < names.length; n++) {
        var key = ("" + names[n]).toLowerCase();
        if (lookup[key]) out.push(lookup[key]);
    }

    return out;
}

function _applyPresetPathsToLayer(comp, targetLayer, presetPaths) {
    if (!comp || !targetLayer || !presetPaths || presetPaths.length === 0) return 0;

    var applied = 0;
    for (var i = 0; i < presetPaths.length; i++) {
        var presetFile = new File(presetPaths[i]);
        if (!presetFile.exists) continue;
        try {
            _deselectAll(comp);
            comp.time = targetLayer.inPoint;
            targetLayer.selected = true;
            targetLayer.applyPreset(presetFile);
            applied++;
        } catch (e) {}
    }

    _deselectAll(comp);
    return applied;
}

function createAdjustmentLayers(name, count, aboveSelected, presetNamesJson, autoApplyPreset) {
    app.beginUndoGroup("Create Adjustment Layers");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var clips = _getTargetClipLayers(comp);

        var layerName = (name && name !== "") ? name : "Adjustment Layer";
        var total = _aeSafeInt(count, 1);
        if (total < 1) total = 1;
        if (total > 50) total = 50;

        var useAboveSelected = (aboveSelected === true || aboveSelected === "true");
        var useAutoApply = (autoApplyPreset === true || autoApplyPreset === "true");

        var presetNames = _parseStringArrayJson(presetNamesJson);
        var presetPaths = useAutoApply ? _findPresetPathsByNames(presetNames) : [];

        var created = 0;
        var appliedPresets = 0;

        // If nothing is selected, behave like Ctrl+Alt+Y:
        // create full-comp adjustment layer(s) instead of returning an error.
        if (!clips || clips.length === 0) {
            for (var n = 0; n < total; n++) {
                var full = comp.layers.addSolid([1, 1, 1], layerName, comp.width, comp.height, comp.pixelAspect, comp.duration);
                full.adjustmentLayer = true;
                full.label = 5; // Lavender
                full.inPoint = 0;
                full.outPoint = comp.duration;
                full.moveToBeginning();
                if (presetPaths.length > 0) {
                    appliedPresets += _applyPresetPathsToLayer(comp, full, presetPaths);
                }
                created++;
            }
        } else {
            for (var c = 0; c < clips.length; c++) {
                var anchor = clips[c];

                for (var i = 0; i < total; i++) {
                    var solid = comp.layers.addSolid([1, 1, 1], layerName, comp.width, comp.height, comp.pixelAspect, comp.duration);
                    solid.adjustmentLayer = true;
                    solid.label = 5; // Lavender
                    solid.inPoint = anchor.inPoint;
                    solid.outPoint = anchor.outPoint;

                    if (useAboveSelected) solid.moveBefore(anchor);
                    else solid.moveToBeginning();

                    if (presetPaths.length > 0) {
                        appliedPresets += _applyPresetPathsToLayer(comp, solid, presetPaths);
                    }

                    created++;
                }
            }
        }

        var msg = "Created " + created + " adjustment layer(s) (Lavender).";
        if (presetPaths.length > 0) msg += " Applied " + appliedPresets + " preset instance(s).";
        return msg;
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function createNullObjects(name, count) {
    app.beginUndoGroup("Create Null Objects");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var clips = _getTargetClipLayers(comp);

        var layerName = (name && name !== "") ? name : "Null Object";
        var total = _aeSafeInt(count, 1);
        if (total < 1) total = 1;
        if (total > 20) total = 20;

        var created = 0;
        var controlled = 0;

        function _getTransformProp(layer, matchName) {
            try {
                var group = layer.property("ADBE Transform Group");
                return group ? group.property(matchName) : null;
            } catch (e) {
                return null;
            }
        }

        function _alignNullToClip(nullLayer, clipLayer) {
            try {
                nullLayer.threeDLayer = clipLayer.threeDLayer;
            } catch (e0) {}

            try {
                var clipPos = _getTransformProp(clipLayer, "ADBE Position");
                var nullPos = _getTransformProp(nullLayer, "ADBE Position");
                if (clipPos && nullPos) {
                    nullPos.setValue(clipPos.value);
                }
            } catch (e1) {}
        }

        // If nothing is selected, create full-comp null(s) instead of returning an error.
        if (!clips || clips.length === 0) {
            for (var n0 = 0; n0 < total; n0++) {
                var free = comp.layers.addNull();
                free.name = layerName;
                free.inPoint = 0;
                free.outPoint = comp.duration;
                free.moveToBeginning();
                created++;
            }
            return "Created " + created + " null object(s) (full comp).";
        }

        for (var c = 0; c < clips.length; c++) {
            var clip = clips[c];
            var lastController = null;

            for (var i = 0; i < total; i++) {
                var n = comp.layers.addNull();
                n.name = layerName;
                n.inPoint = clip.inPoint;
                n.outPoint = clip.outPoint;
                _alignNullToClip(n, clip);
                n.moveBefore(clip);
                try {
                    if (lastController) {
                        n.parent = lastController;
                    }
                } catch (e1) {}
                lastController = n;
                created++;
            }

            try {
                if (lastController) {
                    clip.parent = null;
                    clip.parent = lastController;
                    controlled++;
                }
            } catch (e2) {}
        }

        return "Created " + created + " null object(s) and linked " + controlled + " selected layer(s) to null controls.";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function applyPresetsToSelectedLayers(presetNamesJson) {
    app.beginUndoGroup("Apply Presets To Layers");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var layers = _getSelectedLayers(comp);
        if (!layers || layers.length === 0) return "Error: Select at least one layer.";

        var presetNames = _parseStringArrayJson(presetNamesJson);
        if (!presetNames || presetNames.length === 0) return "Error: Select one or more presets first.";

        var presetPaths = _findPresetPathsByNames(presetNames);
        if (!presetPaths || presetPaths.length === 0) return "Error: Could not find selected preset files in User Presets folder.";

        var total = 0;
        for (var i = 0; i < layers.length; i++) {
            total += _applyPresetPathsToLayer(comp, layers[i], presetPaths);
        }

        return "Applied " + total + " preset instance(s) to " + layers.length + " layer(s).";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function applyPresetPathToSelectedLayers(presetPath) {
    app.beginUndoGroup("Apply Preset Path To Layers");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var layers = _getSelectedLayers(comp);
        if (!layers || layers.length === 0) return "Error: Select at least one layer.";

        var path = _unescapeJSONString(presetPath || "");
        if (!path || !path.length) return "Error: No preset file path provided.";

        var file = new File(path);
        if (!file.exists) return "Error: Preset file does not exist.";

        var total = 0;
        for (var i = 0; i < layers.length; i++) {
            total += _applyPresetPathsToLayer(comp, layers[i], [file.fsName]);
        }
        return "Applied preset to " + layers.length + " layer(s).";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function _collectSelectedOrAllKeys(prop, minCount) {
    if (!prop || prop.numKeys < 1) return [];
    var need = _aeSafeInt(minCount, 1);
    if (need < 1) need = 1;
    var keys = [];
    try {
        if (prop.selectedKeys && prop.selectedKeys.length > 0) {
            for (var i = 0; i < prop.selectedKeys.length; i++) keys.push(prop.selectedKeys[i]);
            if (keys.length >= need) return keys;
        }
    } catch (e0) {}
    for (var k = 1; k <= prop.numKeys; k++) keys.push(k);
    return keys;
}

function _forEachAnimatedProperty(layer, fn) {
    var done = 0;
    function walk(group) {
        if (!group || typeof group.numProperties === "undefined") return;
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i);
            if (!p) continue;
            var hasChildren = (typeof p.numProperties !== "undefined" && p.numProperties > 0);
            if (hasChildren) {
                walk(p);
                continue;
            }
            var keyCount = 0;
            try { keyCount = p.numKeys || 0; } catch (eKeys) { keyCount = 0; }
            if (keyCount > 0) {
                try {
                    if (fn(p) === true) done++;
                } catch (e0) {}
            }
        }
    }
    if (layer && typeof layer.numProperties !== "undefined" && layer.numProperties > 0) {
        for (var r = 1; r <= layer.numProperties; r++) {
            try { walk(layer.property(r)); } catch (eRoot) {}
        }
    }
    return done;
}

function _propLabelLower(prop) {
    try { return String(prop.name || prop.matchName || "").toLowerCase(); } catch (e) { return ""; }
}

function _propChainContains(prop, needles) {
    var current = prop;
    while (current) {
        var label = _propLabelLower(current);
        for (var i = 0; i < needles.length; i++) {
            if (label.indexOf(needles[i]) !== -1) return true;
        }
        try { current = current.parentProperty; } catch (eP) { current = null; }
    }
    return false;
}

function _isLikelySpeechSyncedIntroProp(prop, layer, frameDur) {
    if (!prop || !layer) return false;

    var n = 0;
    try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
    if (n < 2) return false;

    var firstT = 0;
    var secondT = 0;
    try { firstT = prop.keyTime(1); } catch (eF) { return false; }
    try { secondT = prop.keyTime(2); } catch (eS) { return false; }
    if (!(secondT > firstT)) return false;

    var startsNearLayerIn = firstT <= ((layer.inPoint || 0) + (frameDur * 6));
    if (!startsNearLayerIn) return false;

    var label = _propLabelLower(prop);
    var match = "";
    try { match = String(prop.matchName || "").toLowerCase(); } catch (eM) { match = ""; }

    if (label.indexOf("tracking") !== -1 || match.indexOf("tracking") !== -1) return false;

    var isSelectorProp = _propChainContains(prop, ["range selector", "selector", "text animator"]);
    if (isSelectorProp) {
        if (label.indexOf("offset") !== -1 || match.indexOf("percent offset") !== -1) return true;
        if (label.indexOf("start") !== -1 || match.indexOf("percent start") !== -1) return true;
        if (label.indexOf("end") !== -1 || match.indexOf("percent end") !== -1) return true;
        return false;
    }

    if (label.indexOf("opacity") !== -1) return true;

    return false;
}

function _collectLikelyIntroKeyItems(prop, frameDur) {
    if (!prop) return null;

    var n = 0;
    try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
    if (n < 2) return null;

    var items = [];
    for (var k = 1; k <= n; k++) {
        var t = 0;
        try { t = prop.keyTime(k); } catch (eT) { continue; }
        items.push({ idx: k, oldT: t, newT: t });
    }
    if (items.length < 2) return null;

    var introItems = [items[0], items[1]];

    return {
        items: introItems,
        firstT: introItems[0].oldT,
        lastT: introItems[introItems.length - 1].oldT
    };
}

function _collectChainIntroKeyItems(prop, frameDur) {
    if (!prop) return null;

    var n = 0;
    try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
    if (n < 2) return null;

    var items = [];
    for (var k = 1; k <= n; k++) {
        var t = null;
        var v = null;
        try { t = prop.keyTime(k); } catch (eT) { t = null; }
        if (t === null || !isFinite(t)) continue;
        try { v = prop.keyValue(k); } catch (eV) { v = null; }
        items.push({ idx: k, oldT: t, newT: t, val: v });
    }
    if (items.length < 2) return null;

    var label = _propLabelLower(prop);
    var match = "";
    try { match = String(prop.matchName || "").toLowerCase(); } catch (eM) { match = ""; }
    var isSelectorProp = _propChainContains(prop, ["range selector", "selector", "text animator"]);
    if (isSelectorProp || label.indexOf("tracking") !== -1 || match.indexOf("tracking") !== -1) {
        return {
            items: [items[0], items[1]],
            firstT: items[0].oldT,
            lastT: items[1].oldT
        };
    }

    if (label.indexOf("opacity") !== -1) {
        var gapLimit = Math.max(frameDur * 8, 0.10);
        var direction = 0;
        var i;
        for (i = 1; i < items.length; i++) {
            var prevVal = Number(items[i - 1].val);
            var nextVal = Number(items[i].val);
            if (!isFinite(prevVal) || !isFinite(nextVal)) continue;
            var d = nextVal - prevVal;
            if (Math.abs(d) < 0.01) continue;
            direction = d > 0 ? 1 : -1;
            break;
        }
        if (direction === 0) {
            return {
                items: [items[0], items[1]],
                firstT: items[0].oldT,
                lastT: items[1].oldT
            };
        }

        var introItems = [items[0]];
        for (i = 1; i < items.length; i++) {
            var prev = items[i - 1];
            var current = items[i];
            if ((current.oldT - prev.oldT) > gapLimit && introItems.length >= 2) break;

            introItems.push(current);
            var prevValue = Number(prev.val);
            var currentValue = Number(current.val);
            if (!isFinite(prevValue) || !isFinite(currentValue)) continue;

            var delta = currentValue - prevValue;
            if (direction > 0) {
                if (delta < -0.01 && introItems.length >= 2) {
                    introItems.pop();
                    break;
                }
            } else {
                if (delta > 0.01 && introItems.length >= 2) {
                    introItems.pop();
                    break;
                }
            }
        }

        if (introItems.length < 2) introItems = [items[0], items[1]];
        return {
            items: introItems,
            firstT: introItems[0].oldT,
            lastT: introItems[introItems.length - 1].oldT
        };
    }

    return {
        items: [items[0], items[1]],
        firstT: items[0].oldT,
        lastT: items[1].oldT
    };
}

function _isLikelySelectorIntroProp(prop, layer, frameDur) {
    if (!prop || !layer) return false;
    if (!_isLikelySpeechSyncedIntroProp(prop, layer, frameDur)) return false;

    var label = _propLabelLower(prop);
    var match = "";
    try { match = String(prop.matchName || "").toLowerCase(); } catch (eM) { match = ""; }
    var isSelectorProp = _propChainContains(prop, ["range selector", "selector", "text animator"]);
    if (!isSelectorProp) return false;

    if (label.indexOf("offset") !== -1 || match.indexOf("percent offset") !== -1) return true;
    if (label.indexOf("start") !== -1 || match.indexOf("percent start") !== -1) return true;
    if (label.indexOf("end") !== -1 || match.indexOf("percent end") !== -1) return true;
    return false;
}

function _getPreferredChainIntroProp(layer, comp) {
    if (!layer || !comp) return null;

    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var bestProp = null;
    var bestFirst = null;

    _forEachAnimatedProperty(layer, function (prop) {
        if (!_isLikelySelectorIntroProp(prop, layer, frameDur)) return false;
        var intro = _collectChainIntroKeyItems(prop, frameDur);
        if (!intro || !intro.items || intro.items.length < 2) return false;
        if (bestFirst === null || intro.firstT < bestFirst) {
            bestFirst = intro.firstT;
            bestProp = prop;
        }
        return false;
    });

    return bestProp;
}

function _captureChainIntroItems(layer, comp) {
    if (!layer || !comp) return { entries: [], earliestStart: null, latestEnd: null };

    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var entries = [];
    var earliestStart = null;
    var latestEnd = null;

    _forEachAnimatedProperty(layer, function (prop) {
        var label = _propLabelLower(prop);
        var isOpacity = label.indexOf("opacity") !== -1;
        var isBlur = label.indexOf("blur") !== -1;
        var isScale = label.indexOf("scale") !== -1;
        if (!isOpacity && !isBlur && !isScale) return false;

        var intro = _collectChainIntroKeyItems(prop, frameDur);
        if (!intro || !intro.items || intro.items.length < 2) return false;

        entries.push({ prop: prop, items: intro.items, firstT: intro.firstT, lastT: intro.lastT });
        if (earliestStart === null || intro.firstT < earliestStart) earliestStart = intro.firstT;
        if (latestEnd === null || intro.lastT > latestEnd) latestEnd = intro.lastT;
        return false;
    });

    return { entries: entries, earliestStart: earliestStart, latestEnd: latestEnd };
}

function _propStartsNearLayerIn(prop, layer, frameDur) {
    if (!prop || !layer) return false;
    var n = 0;
    try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
    if (n < 2) return false;

    var firstT = null;
    try { firstT = prop.keyTime(1); } catch (eT) { firstT = null; }
    if (firstT === null || !isFinite(firstT)) return false;
    return firstT <= ((layer.inPoint || 0) + (frameDur * 6));
}

function _isChainFamilyStartSelectorProp(prop, layer, frameDur) {
    if (!_isLikelySelectorIntroProp(prop, layer, frameDur)) return false;
    var label = _propLabelLower(prop);
    var match = "";
    try { match = String(prop.matchName || "").toLowerCase(); } catch (eM) { match = ""; }
    return (label.indexOf("start") !== -1 || match.indexOf("percent start") !== -1);
}

function _getTextAnimatorAncestor(prop) {
    var current = prop;
    while (current) {
        var label = _propLabelLower(current);
        if (label.indexOf("text animator") !== -1) return current;
        try { current = current.parentProperty; } catch (eP) { current = null; }
    }
    return null;
}

function _getLayerAncestorFromProp(prop) {
    var current = prop;
    while (current) {
        try {
            if (typeof current.outPoint !== "undefined" && typeof current.inPoint !== "undefined") {
                return current;
            }
        } catch (eCheck) {}
        try { current = current.parentProperty; } catch (eP) { current = null; }
    }
    return null;
}

function _findDescendantPropsByLabel(root, needles, out, depth, maxDepth) {
    if (!root || !needles || !out) return;
    depth = depth || 0;
    maxDepth = isFinite(Number(maxDepth)) ? Number(maxDepth) : 4;
    if (depth > maxDepth) return;

    var count = 0;
    try { count = root.numProperties || 0; } catch (eC) { count = 0; }
    for (var i = 1; i <= count; i++) {
        var child = null;
        try { child = root.property(i); } catch (eP) { child = null; }
        if (!child) continue;
        var label = _propLabelLower(child);
        var match = true;
        for (var n = 0; n < needles.length; n++) {
            if (label.indexOf(needles[n]) === -1) {
                match = false;
                break;
            }
        }
        if (match) out.push(child);
        _findDescendantPropsByLabel(child, needles, out, depth + 1, maxDepth);
    }
}

function _getNumericPropValueSafe(prop) {
    if (!prop) return null;
    try {
        var v = prop.value;
        if (typeof v === "number" && isFinite(v)) return Number(v);
    } catch (eV) {}
    return null;
}

function _getOffsetSelectorRampRole(prop) {
    if (!prop) return "unknown";
    var selectorGroup = null;
    try { selectorGroup = prop.parentProperty; } catch (eP) { selectorGroup = null; }
    if (!selectorGroup) return "unknown";

    var rampUpProps = [];
    var rampDownProps = [];
    _findDescendantPropsByLabel(selectorGroup, ["ramp", "up"], rampUpProps, 0, 4);
    _findDescendantPropsByLabel(selectorGroup, ["ramp", "down"], rampDownProps, 0, 4);

    var upVal = null;
    var downVal = null;
    if (rampUpProps.length > 0) upVal = _getNumericPropValueSafe(rampUpProps[0]);
    if (rampDownProps.length > 0) downVal = _getNumericPropValueSafe(rampDownProps[0]);

    if (isFinite(upVal) && isFinite(downVal)) {
        if (upVal > downVal + 0.001) return "intro";
        if (downVal > upVal + 0.001) return "outro";
    } else if (isFinite(upVal) && !isFinite(downVal)) {
        return "intro";
    } else if (isFinite(downVal) && !isFinite(upVal)) {
        return "outro";
    }

    return "unknown";
}

function _captureAllPropKeys(prop) {
    if (!prop) return null;
    var n = 0;
    try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
    if (n < 1) return null;

    var items = [];
    var firstT = null;
    var lastT = null;
    for (var k = 1; k <= n; k++) {
        var t = null;
        try { t = prop.keyTime(k); } catch (eT) { t = null; }
        if (t === null || !isFinite(t)) continue;
        items.push({ idx: k, oldT: t, newT: t });
        if (firstT === null || t < firstT) firstT = t;
        if (lastT === null || t > lastT) lastT = t;
    }
    if (items.length < 1) return null;
    return { prop: prop, items: items, firstT: firstT, lastT: lastT };
}

function classifyChainPresetProfile(layer, comp) {
    if (!layer || !comp) return "generic_profile";
    if (_findChainFamilySignatureProps(layer, comp)) return "selector_tracking_blur_opacity_family";
    if (_findOffsetSelectorFamilyProps(layer, comp)) return "offset_selector_family";
    return "generic_profile";
}

function _findChainFamilySignatureProps(layer, comp) {
    if (!layer || !comp) return null;
    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var selectorProp = null;
    var selectorAnimator = null;
    var trackingProp = null;
    var opacityProp = null;
    var blurProp = null;

    _forEachAnimatedProperty(layer, function (prop) {
        if (selectorProp) return false;
        if (_isChainFamilyStartSelectorProp(prop, layer, frameDur)) {
            selectorProp = prop;
            selectorAnimator = _getTextAnimatorAncestor(prop);
            return true;
        }
        return false;
    });

    if (!selectorProp) return null;

    _forEachAnimatedProperty(layer, function (prop) {
        var label = _propLabelLower(prop);
        var match = "";
        try { match = String(prop.matchName || "").toLowerCase(); } catch (eM) { match = ""; }

        if (!trackingProp && (label.indexOf("tracking") !== -1 || match.indexOf("tracking") !== -1)) {
            var trackingAnimator = _getTextAnimatorAncestor(prop);
            if ((selectorAnimator && trackingAnimator === selectorAnimator) || _propStartsNearLayerIn(prop, layer, frameDur)) {
                trackingProp = prop;
                return false;
            }
        }

        if (!opacityProp && label.indexOf("opacity") !== -1) {
            var opacityAnimator = _getTextAnimatorAncestor(prop);
            if (
                (selectorAnimator && opacityAnimator === selectorAnimator) ||
                !_propChainContains(prop, ["text animator", "text properties"]) ||
                _propStartsNearLayerIn(prop, layer, frameDur) ||
                (!selectorAnimator)
            ) {
                opacityProp = prop;
                return false;
            }
        }

        if (!blurProp && label.indexOf("blur amount") !== -1 && _propChainContains(prop, ["s_blur", "blur"])) {
            blurProp = prop;
            return false;
        }

        if (trackingProp && opacityProp && blurProp) {
            return true;
        }
        return false;
    });

    if (!selectorProp || !trackingProp || !opacityProp || !blurProp) return null;
    return {
        selectorProp: selectorProp,
        trackingProp: trackingProp,
        opacityProp: opacityProp,
        blurProp: blurProp
    };
}

function _findOffsetSelectorFamilyProps(layer, comp) {
    if (!layer || !comp) return null;
    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var selectorProps = [];
    var trackingProp = null;
    var opacityProp = null;
    var blurProp = null;
    var scaleProp = null;

    _forEachAnimatedProperty(layer, function (prop) {
        if (_isOffsetSelectorIntroProp(prop) && _propStartsNearLayerIn(prop, layer, frameDur)) {
            var intro = _collectChainIntroKeyItems(prop, frameDur);
            if (intro && intro.items && intro.items.length >= 2) {
                selectorProps.push({ prop: prop, intro: intro, role: _getOffsetSelectorRampRole(prop) });
            }
        }
        return false;
    });

    if (selectorProps.length < 2) return null;
    selectorProps.sort(function (a, b) {
        var aScore = a.role === "intro" ? 0 : (a.role === "unknown" ? 1 : 2);
        var bScore = b.role === "intro" ? 0 : (b.role === "unknown" ? 1 : 2);
        if (aScore !== bScore) return aScore - bScore;
        return Number(a.intro.firstT) - Number(b.intro.firstT);
    });

    _forEachAnimatedProperty(layer, function (prop) {
        var label = _propLabelLower(prop);
        var match = "";
        try { match = String(prop.matchName || "").toLowerCase(); } catch (eM) { match = ""; }

        if (!trackingProp && (label.indexOf("tracking") !== -1 || match.indexOf("tracking") !== -1)) {
            trackingProp = prop;
            return false;
        }
        if (!opacityProp && label.indexOf("opacity") !== -1) {
            opacityProp = prop;
            return false;
        }
        if (!blurProp && label.indexOf("blur") !== -1) {
            blurProp = prop;
            return false;
        }
        if (!scaleProp && label.indexOf("scale") !== -1) {
            scaleProp = prop;
            return false;
        }
        return false;
    });

    return {
        referenceProp: selectorProps[0].prop,
        selectorProps: selectorProps,
        trackingProp: trackingProp,
        opacityProp: opacityProp,
        blurProp: blurProp,
        scaleProp: scaleProp
    };
}

function captureChainProfileState(layer, comp, profile) {
    if (!layer || !comp) return null;

    var signature = null;
    if (profile === "selector_tracking_blur_opacity_family") {
        signature = _findChainFamilySignatureProps(layer, comp);
    } else if (profile === "offset_selector_family") {
        signature = _findOffsetSelectorFamilyProps(layer, comp);
    } else {
        return null;
    }
    if (!signature) return null;

    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var offsetIntroSelectorInfos = null;
    if (profile === "offset_selector_family") {
        offsetIntroSelectorInfos = [];
        for (var osi = 0; osi < signature.selectorProps.length; osi++) {
            if (signature.selectorProps[osi] && signature.selectorProps[osi].role === "intro") {
                offsetIntroSelectorInfos.push(signature.selectorProps[osi]);
            }
        }
        if (offsetIntroSelectorInfos.length < 1 && signature.selectorProps.length > 0) {
            offsetIntroSelectorInfos.push(signature.selectorProps[0]);
        }
    }

    var selectorProp = profile === "offset_selector_family"
        ? (offsetIntroSelectorInfos && offsetIntroSelectorInfos.length ? offsetIntroSelectorInfos[0].prop : signature.referenceProp)
        : signature.selectorProp;
    var selectorIntro = _collectChainIntroKeyItems(selectorProp, frameDur);
    if (!selectorIntro || !selectorIntro.items || selectorIntro.items.length < 2) return null;

    var trackingFullEntry = null;
    if (profile === "selector_tracking_blur_opacity_family") {
        trackingFullEntry = _captureAllPropKeys(signature.trackingProp);
    }

    var familyEntries = [];
    var fullStructureEntries = [];
    var linkedIntroEntries = [];
    var tracked = [];
    var introAnchorFirst = selectorIntro.firstT;
    var introAnchorLast = selectorIntro.lastT;
    if (profile === "offset_selector_family") {
        var seenOffsetProps = [];
        function _pushOffsetFullEntry(p) {
            if (!p) return;
            for (var spi = 0; spi < seenOffsetProps.length; spi++) {
                if (seenOffsetProps[spi] === p) return;
            }
            seenOffsetProps.push(p);
            var fullEntry = _captureAllPropKeys(p);
            if (fullEntry) fullStructureEntries.push(fullEntry);
        }

        var refSkipMap = {};
        for (var ri = 0; ri < selectorIntro.items.length; ri++) {
            refSkipMap[selectorIntro.items[ri].idx] = true;
        }

        var referenceFull = _captureAllPropKeys(selectorProp);
        if (referenceFull) {
            referenceFull.role = "family_tail";
            referenceFull.skipIdxMap = refSkipMap;
            familyEntries.push(referenceFull);
        }
        _pushOffsetFullEntry(selectorProp);

        for (var si = 0; si < signature.selectorProps.length; si++) {
            var selectorInfo = signature.selectorProps[si];
            if (!selectorInfo || selectorInfo.prop === selectorProp) continue;
            var selectorIntroInfo = selectorInfo.intro;
            var selectorSkipMap = {};
            var includeAsIntro = false;
            for (var oii = 0; oii < (offsetIntroSelectorInfos ? offsetIntroSelectorInfos.length : 0); oii++) {
                if (offsetIntroSelectorInfos[oii] && offsetIntroSelectorInfos[oii].prop === selectorInfo.prop) {
                    includeAsIntro = true;
                    break;
                }
            }
            if (includeAsIntro && selectorIntroInfo && selectorIntroInfo.items && selectorIntroInfo.items.length) {
                linkedIntroEntries.push({
                    prop: selectorInfo.prop,
                    items: selectorIntroInfo.items,
                    firstT: selectorIntroInfo.firstT,
                    lastT: selectorIntroInfo.lastT,
                    role: "linked_intro"
                });
                if (isFinite(selectorIntroInfo.firstT)) introAnchorFirst = Math.min(introAnchorFirst, selectorIntroInfo.firstT);
                if (isFinite(selectorIntroInfo.lastT)) introAnchorLast = Math.max(introAnchorLast, selectorIntroInfo.lastT);
                for (var sii = 0; sii < selectorIntroInfo.items.length; sii++) {
                    selectorSkipMap[selectorIntroInfo.items[sii].idx] = true;
                }
            }
            var selectorFull = _captureAllPropKeys(selectorInfo.prop);
            if (!selectorFull) continue;
            selectorFull.role = "family_tail";
            selectorFull.skipIdxMap = selectorSkipMap;
            familyEntries.push(selectorFull);
            _pushOffsetFullEntry(selectorInfo.prop);
        }
        tracked = [signature.trackingProp, signature.opacityProp, signature.blurProp, signature.scaleProp];
    } else {
        tracked = [signature.opacityProp, signature.blurProp];
    }
    for (var i = 0; i < tracked.length; i++) {
        var full = _captureAllPropKeys(tracked[i]);
        if (!full) continue;
        full.role = "family_tail";
        full.skipIdxMap = {};
        familyEntries.push(full);
        if (profile === "offset_selector_family") {
            fullStructureEntries.push(_captureAllPropKeys(tracked[i]));
        }
    }

    if (profile === "offset_selector_family") {
        var filteredFull = [];
        for (var ffi = 0; ffi < fullStructureEntries.length; ffi++) {
            if (fullStructureEntries[ffi]) filteredFull.push(fullStructureEntries[ffi]);
        }
        fullStructureEntries = filteredFull;
    }

    return {
        profile: profile,
        sourceLayerInPoint: Number(layer.inPoint),
        sourceLayerOutPoint: Number(layer.outPoint),
        selectorProp: selectorProp,
        introMoveMode: profile === "offset_selector_family" ? "block" : "window",
        reference: {
            prop: selectorProp,
            items: selectorIntro.items,
            firstT: selectorIntro.firstT,
            lastT: selectorIntro.lastT,
            role: "reference"
        },
        introAnchor: {
            firstT: introAnchorFirst,
            lastT: introAnchorLast
        },
        fullStructureEntries: fullStructureEntries,
        linkedIntroEntries: linkedIntroEntries,
        familyEntries: familyEntries,
        trackingFullEntry: trackingFullEntry
    };
}

function _restoreOffsetSelectorFamilyTail(layer, comp, state) {
    if (!layer || !comp || !state || !state.reference) return { moved: 0, props: 0 };
    var sourceAnchor = state.introAnchor || state.reference;
    var currentAnchor = _collectCurrentChainProfileIntroAnchor(state, comp);
    if (!currentAnchor || !isFinite(currentAnchor.lastT) || !isFinite(sourceAnchor.lastT)) return { moved: 0, props: 0 };
    var delta = Number(currentAnchor.lastT) - Number(sourceAnchor.lastT);
    if (!isFinite(delta) || Math.abs(delta) < 0.000001) return { moved: 0, props: 0 };
    return _restoreCapturedFamilyEntriesWithDelta(state.familyEntries, delta);
}

function _collectCurrentChainProfileIntroAnchor(state, comp) {
    if (!state || !state.reference || !comp) return null;
    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var firstT = null;
    var lastT = null;

    var ref = _collectChainIntroKeyItems(state.reference.prop, frameDur);
    if (ref && isFinite(ref.firstT) && isFinite(ref.lastT)) {
        firstT = ref.firstT;
        lastT = ref.lastT;
    }

    for (var i = 0; i < (state.linkedIntroEntries ? state.linkedIntroEntries.length : 0); i++) {
        var entry = state.linkedIntroEntries[i];
        if (!entry || !entry.prop) continue;
        var cur = _collectChainIntroKeyItems(entry.prop, frameDur);
        if (!cur || !isFinite(cur.firstT) || !isFinite(cur.lastT)) continue;
        if (!isFinite(firstT)) firstT = cur.firstT;
        else firstT = Math.min(firstT, cur.firstT);
        if (!isFinite(lastT)) lastT = cur.lastT;
        else lastT = Math.max(lastT, cur.lastT);
    }

    if (!isFinite(firstT) || !isFinite(lastT)) return null;
    return { firstT: firstT, lastT: lastT };
}

function _restoreCapturedFamilyEntriesWithDelta(entries, deltaSec) {
    if (!entries || !entries.length || !isFinite(deltaSec)) return { moved: 0, props: 0 };
    var movedKeys = 0;
    var affectedProps = 0;

    for (var e = 0; e < entries.length; e++) {
        var entry = entries[e];
        if (!entry || !entry.prop || !entry.items || !entry.items.length) continue;

        var items = [];
        for (var i = 0; i < entry.items.length; i++) {
            if (entry.skipIdxMap && entry.skipIdxMap[entry.items[i].idx]) continue;
            items.push({
                idx: entry.items[i].idx,
                oldT: entry.items[i].oldT,
                newT: entry.items[i].oldT + deltaSec
            });
        }
        if (items.length < 1) continue;

        var movedOnProp = _retimePropWithMappedTimes(entry.prop, items, 1);
        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
        }
    }

    return { moved: movedKeys, props: affectedProps };
}

function _restoreCapturedFamilyEntriesAnchoredToOut(entries, sourceReference, currentReference, sourceLayerOutPoint, currentLayerOutPoint) {
    if (!entries || !entries.length || !sourceReference || !currentReference) return { moved: 0, props: 0 };
    if (!isFinite(sourceReference.lastT) || !isFinite(currentReference.lastT)) return { moved: 0, props: 0 };
    if (!isFinite(sourceLayerOutPoint) || !isFinite(currentLayerOutPoint)) return { moved: 0, props: 0 };

    var movedKeys = 0;
    var affectedProps = 0;

    for (var e = 0; e < entries.length; e++) {
        var entry = entries[e];
        if (!entry || !entry.prop || !entry.items || entry.items.length < 1) continue;

        var targetStart = Number(currentReference.lastT) + (Number(entry.firstT) - Number(sourceReference.lastT));
        var targetEnd = Number(currentLayerOutPoint) - (Number(sourceLayerOutPoint) - Number(entry.lastT));
        if (!isFinite(targetStart) || !isFinite(targetEnd)) continue;
        if (!(targetEnd > targetStart)) {
            targetEnd = targetStart + (Number(entry.lastT) - Number(entry.firstT));
        }
        if (!(targetEnd > targetStart)) continue;

        var movedOnProp = _retimeCapturedKeyRangeToWindow(entry.prop, entry, targetStart, targetEnd);
        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
        }
    }

    return { moved: movedKeys, props: affectedProps };
}

function _restoreTrackingEntryFromReference(entry, sourceReference, currentReference) {
    if (!entry || !entry.prop || !entry.items || entry.items.length < 2) return { moved: 0, props: 0 };
    if (!sourceReference || !currentReference) return { moved: 0, props: 0 };
    if (!isFinite(sourceReference.lastT) || !isFinite(currentReference.lastT)) return { moved: 0, props: 0 };

    var targetStart = Number(currentReference.lastT) + (Number(entry.firstT) - Number(sourceReference.lastT));
    var targetEnd = targetStart + (Number(entry.lastT) - Number(entry.firstT));
    if (!isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) {
        return { moved: 0, props: 0 };
    }

    var moved = _retimeCapturedKeyRangeToWindow(entry.prop, entry, targetStart, targetEnd);
    return { moved: moved, props: moved > 0 ? 1 : 0 };
}

function _restoreTrackingEntryFromReferenceForOverlap(entry, sourceReference, currentReference, comp) {
    if (!entry || !entry.prop || !entry.items || entry.items.length < 2) return { moved: 0, props: 0 };
    if (!sourceReference || !currentReference || !comp) return { moved: 0, props: 0 };
    if (!isFinite(sourceReference.lastT) || !isFinite(currentReference.lastT)) return { moved: 0, props: 0 };

    var targetStart = Number(currentReference.lastT) + (Number(entry.firstT) - Number(sourceReference.lastT));
    var targetEnd = targetStart + (Number(entry.lastT) - Number(entry.firstT));
    var layer = _getLayerAncestorFromProp(entry.prop);
    if (layer && isFinite(Number(layer.inPoint))) {
        targetStart = Number(layer.inPoint);
    }
    if (layer && isFinite(Number(layer.outPoint))) {
        targetEnd = Number(layer.outPoint);
    }

    if (!isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) {
        targetEnd = targetStart + (Number(entry.lastT) - Number(entry.firstT));
    }
    if (!isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) {
        return { moved: 0, props: 0 };
    }

    var moved = _retimeCapturedKeyRangeToWindow(entry.prop, entry, targetStart, targetEnd);
    return { moved: moved, props: moved > 0 ? 1 : 0 };
}

function _retimeChainProfileIntro(layer, comp, state, speechStartSec, speechEndSec) {
    if (!layer || !comp || !state || !state.reference) return { moved: 0, props: 0 };
    var movedKeys = 0;
    var affectedProps = 0;

    var selectorMoved = 0;
    if (state.profile === "offset_selector_family") {
        var sourceAnchor = state.introAnchor || state.reference;
        var deltaOffset = Number(speechStartSec) - Number(sourceAnchor.firstT);
        if (isFinite(deltaOffset)) {
            var mappedOffset = [];
            for (var soi = 0; soi < state.reference.items.length; soi++) {
                mappedOffset.push({
                    idx: state.reference.items[soi].idx,
                    oldT: state.reference.items[soi].oldT,
                    newT: Number(state.reference.items[soi].oldT) + deltaOffset
                });
            }
            selectorMoved = _retimePropWithMappedTimes(state.reference.prop, mappedOffset, 1);
        }
    } else if (state.introMoveMode === "block") {
        var delta = Number(speechStartSec) - Number((state.introAnchor || state.reference).firstT);
        if (isFinite(delta)) {
            var mapped = [];
            for (var si = 0; si < state.reference.items.length; si++) {
                mapped.push({
                    idx: state.reference.items[si].idx,
                    oldT: state.reference.items[si].oldT,
                    newT: Number(state.reference.items[si].oldT) + delta
                });
            }
            selectorMoved = _retimePropWithMappedTimes(state.reference.prop, mapped, 1);
        }
    } else {
        selectorMoved = _retimeCapturedKeyRangeToWindow(state.reference.prop, state.reference, Number(speechStartSec), Number(speechEndSec));
    }
    if (selectorMoved > 0) {
        movedKeys += selectorMoved;
        affectedProps++;
    }

    for (var i = 0; i < state.linkedIntroEntries.length; i++) {
        var entry = state.linkedIntroEntries[i];
        var movedOnProp = 0;
        if (state.profile === "offset_selector_family") {
            var sourceAnchorLinked = state.introAnchor || state.reference;
            var deltaLinkedOffset = Number(speechStartSec) - Number(sourceAnchorLinked.firstT);
            if (isFinite(deltaLinkedOffset)) {
                var mappedOffsetLinked = [];
                for (var oli = 0; oli < entry.items.length; oli++) {
                    mappedOffsetLinked.push({
                        idx: entry.items[oli].idx,
                        oldT: entry.items[oli].oldT,
                        newT: Number(entry.items[oli].oldT) + deltaLinkedOffset
                    });
                }
                movedOnProp = _retimePropWithMappedTimes(entry.prop, mappedOffsetLinked, 1);
            }
        } else if (state.introMoveMode === "block") {
            var deltaLinked = Number(speechStartSec) - Number((state.introAnchor || state.reference).firstT);
            if (isFinite(deltaLinked)) {
                var mappedLinked = [];
                for (var li = 0; li < entry.items.length; li++) {
                    mappedLinked.push({
                        idx: entry.items[li].idx,
                        oldT: entry.items[li].oldT,
                        newT: Number(entry.items[li].oldT) + deltaLinked
                    });
                }
                movedOnProp = _retimePropWithMappedTimes(entry.prop, mappedLinked, 1);
            }
        } else {
            movedOnProp = _retimeCapturedKeyRangeToWindow(entry.prop, entry, Number(speechStartSec), Number(speechEndSec));
        }
        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
        }
    }

    return { moved: movedKeys, props: affectedProps };
}

function _restoreChainProfileFamilyTail(layer, comp, state) {
    if (!layer || !comp || !state || !state.reference) return { moved: 0, props: 0 };
    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var currentRef = _collectChainIntroKeyItems(state.reference.prop, frameDur);
    if (!currentRef || !isFinite(currentRef.lastT) || !isFinite(state.reference.lastT)) return { moved: 0, props: 0 };

    var delta = Number(currentRef.lastT) - Number(state.reference.lastT);
    if (!isFinite(delta) || Math.abs(delta) < 0.000001) return { moved: 0, props: 0 };
    var restored = _restoreCapturedFamilyEntriesWithDelta(state.familyEntries, delta);
    if (state.trackingFullEntry) {
        var trackingRestored = _restoreTrackingEntryFromReference(state.trackingFullEntry, state.reference, currentRef);
        restored.moved += trackingRestored.moved;
        restored.props += trackingRestored.props;
    }
    return restored;
}

function _restoreChainProfileFamilyTailForOverlap(layer, comp, state) {
    if (!layer || !comp || !state || !state.reference) return { moved: 0, props: 0 };
    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var currentRef = _collectChainIntroKeyItems(state.reference.prop, frameDur);
    if (!currentRef || !isFinite(currentRef.lastT) || !isFinite(state.reference.lastT)) return { moved: 0, props: 0 };

    var restored = _restoreCapturedFamilyEntriesAnchoredToOut(
        state.familyEntries,
        state.reference,
        currentRef,
        state.sourceLayerOutPoint,
        Number(layer.outPoint)
    );
    return restored;
}

function _stretchTrackingPropToLayerSpan(trackingProp, layer) {
    if (!trackingProp || !layer) return { moved: 0, props: 0 };
    var tracking = _captureAllPropKeys(trackingProp);
    if (!tracking || !tracking.items || tracking.items.length < 2) return { moved: 0, props: 0 };
    var targetStart = Number(layer.inPoint);
    var targetEnd = Number(layer.outPoint);
    if (!isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) {
        return { moved: 0, props: 0 };
    }
    var moved = _retimeCapturedKeyRangeToWindow(trackingProp, tracking, targetStart, targetEnd);
    return { moved: moved, props: moved > 0 ? 1 : 0 };
}

function _forceTrackingPropToLayerSpan(trackingProp, layer) {
    if (!trackingProp || !layer) return { moved: 0, props: 0 };
    var tracking = _captureAllPropKeys(trackingProp);
    if (!tracking || !tracking.items || tracking.items.length < 2) return { moved: 0, props: 0 };

    var targetStart = Number(layer.inPoint);
    var targetEnd = Number(layer.outPoint);
    if (!isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) return { moved: 0, props: 0 };

    var sourceFirst = Number(tracking.firstT);
    var sourceLast = Number(tracking.lastT);
    if (!isFinite(sourceFirst) || !isFinite(sourceLast) || !(sourceLast > sourceFirst)) {
        return { moved: 0, props: 0 };
    }

    var ratio = (targetEnd - targetStart) / (sourceLast - sourceFirst);
    var items = [];
    for (var i = 0; i < tracking.items.length; i++) {
        var item = tracking.items[i];
        var mappedTime = targetStart + ((item.oldT - sourceFirst) * ratio);
        if (i === 0) mappedTime = targetStart;
        if (i === tracking.items.length - 1) mappedTime = targetEnd;
        items.push({
            idx: item.idx,
            oldT: item.oldT,
            newT: mappedTime
        });
    }

    var moved = _retimePropWithMappedTimes(trackingProp, items, ratio !== 0 ? (1 / ratio) : 1);
    return { moved: moved, props: moved > 0 ? 1 : 0 };
}

function _forceTrackingPropToChainSpan(trackingProp, layer, comp) {
    if (!trackingProp || !layer || !comp) return { moved: 0, props: 0 };
    var tracking = _captureAllPropKeys(trackingProp);
    if (!tracking || !tracking.items || tracking.items.length < 2) return { moved: 0, props: 0 };

    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    if (!isFinite(frameDur) || frameDur <= 0) return { moved: 0, props: 0 };

    var targetStart = Number(layer.inPoint);
    var targetEnd = Number(layer.outPoint) - frameDur;
    if (!isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) return { moved: 0, props: 0 };

    var sourceFirst = Number(tracking.firstT);
    var sourceLast = Number(tracking.lastT);
    if (!isFinite(sourceFirst) || !isFinite(sourceLast) || !(sourceLast > sourceFirst)) {
        return { moved: 0, props: 0 };
    }

    var ratio = (targetEnd - targetStart) / (sourceLast - sourceFirst);
    var items = [];
    for (var i = 0; i < tracking.items.length; i++) {
        var item = tracking.items[i];
        var mappedTime = targetStart + ((item.oldT - sourceFirst) * ratio);
        if (i === 0) mappedTime = targetStart;
        if (i === tracking.items.length - 1) mappedTime = targetEnd;
        items.push({
            idx: item.idx,
            oldT: item.oldT,
            newT: mappedTime
        });
    }

    var moved = _retimePropWithMappedTimes(trackingProp, items, ratio !== 0 ? (1 / ratio) : 1);
    return { moved: moved, props: moved > 0 ? 1 : 0 };
}

function _ensureTrackingEndpointsAtLayerSpan(trackingProp, layer) {
    if (!trackingProp || !layer) return 0;
    var targetStart = Number(layer.inPoint);
    var targetEnd = Number(layer.outPoint);
    if (!isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) return 0;

    var n = 0;
    try { n = trackingProp.numKeys || 0; } catch (eN) { n = 0; }
    if (n < 2) return 0;

    var moved = 0;
    try {
        trackingProp.setKeyTime(n, targetEnd);
        moved++;
    } catch (eLast) {}
    try {
        trackingProp.setKeyTime(1, targetStart);
        moved++;
    } catch (eFirst) {}
    return moved;
}

function _ensureTrackingEndpointsAtLayerSpanForChain(trackingProp, layer, comp) {
    if (!trackingProp || !layer || !comp) return 0;
    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    if (!isFinite(frameDur) || frameDur <= 0) frameDur = 0;

    var targetStart = Number(layer.inPoint);
    var targetEnd = Number(layer.outPoint) - (frameDur * 3);
    if (!isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) return 0;

    var n = 0;
    try { n = trackingProp.numKeys || 0; } catch (eN) { n = 0; }
    if (n < 2) return 0;

    var moved = 0;
    try {
        trackingProp.setKeyTime(n, targetEnd);
        moved++;
    } catch (eLast) {}
    try {
        trackingProp.setKeyTime(1, targetStart);
        moved++;
    } catch (eFirst) {}
    return moved;
}

function _applyChainProfileLayerTiming(layer, comp, speechStartSec, preserveCurrentOut) {
    if (!layer || !comp) return;
    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var keySpan = _getLayerKeyTimeSpanExcludingTracking(layer);
    var firstKey = (keySpan && isFinite(keySpan.first)) ? keySpan.first : null;
    var lastKey = (keySpan && isFinite(keySpan.last)) ? keySpan.last : null;
    if (!isFinite(firstKey) || !isFinite(lastKey)) {
        keySpan = _getLayerKeyTimeSpan(layer);
        if (!isFinite(firstKey)) firstKey = (keySpan && isFinite(keySpan.first)) ? keySpan.first : null;
        if (!isFinite(lastKey)) lastKey = (keySpan && isFinite(keySpan.last)) ? keySpan.last : null;
    }

    if (isFinite(Number(speechStartSec)) && isFinite(firstKey)) {
        layer.inPoint = Math.min(Number(speechStartSec), firstKey);
    } else if (isFinite(firstKey)) {
        layer.inPoint = Math.min(layer.inPoint, firstKey);
    }

    if (isFinite(lastKey)) {
        var desiredOut = lastKey + frameDur;
        if (preserveCurrentOut === true) {
            layer.outPoint = Math.max(layer.outPoint, desiredOut, layer.inPoint + frameDur);
        } else {
            layer.outPoint = Math.max(layer.inPoint + frameDur, desiredOut);
        }
    }
}

function _snapTimeUpToFrame(comp, timeSec) {
    if (!comp || !isFinite(timeSec)) return timeSec;
    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    if (!isFinite(frameDur) || frameDur <= 0) return timeSec;
    var start = isFinite(Number(comp.displayStartTime)) ? Number(comp.displayStartTime) : 0;
    return start + (Math.ceil((timeSec - start) / frameDur) * frameDur);
}

function _trimLayerOutToAnimatedSpan(layer, comp, tailPaddingFrames, excludeTracking) {
    if (!layer || !comp) return false;
    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    if (!isFinite(frameDur) || frameDur <= 0) return false;

    var paddingFrames = isFinite(Number(tailPaddingFrames)) ? Number(tailPaddingFrames) : 1;
    var paddingSec = frameDur * paddingFrames;

    var span = null;
    try {
        span = excludeTracking ? _getLayerKeyTimeSpanExcludingTracking(layer) : _getLayerKeyTimeSpan(layer);
    } catch (eSpan) { span = null; }
    if ((!span || !isFinite(span.last)) && excludeTracking) {
        try { span = _getLayerKeyTimeSpan(layer); } catch (eSpan2) { span = null; }
    }
    if (!span || !isFinite(span.last)) return false;

    var desiredOutPoint = _snapTimeUpToFrame(comp, span.last + paddingSec);
    if (!isFinite(desiredOutPoint)) return false;
    layer.outPoint = Math.max(layer.inPoint + frameDur, desiredOutPoint);
    return true;
}

function _setLastKeyOfPropToLayerOut(prop, layer) {
    if (!prop || !layer) return false;
    var n = 0;
    try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
    if (n < 2) return false;
    var target = Number(layer.outPoint);
    if (!isFinite(target)) return false;
    try {
        prop.setKeyTime(n, target);
        return true;
    } catch (eSet) {
        return false;
    }
}

function _setLastKeyOfPropToTime(prop, targetTime) {
    if (!prop || !isFinite(targetTime)) return false;
    var n = 0;
    try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
    if (n < 2) return false;
    try {
        prop.setKeyTime(n, targetTime);
        return true;
    } catch (eSet) {
        return false;
    }
}

function _retimeCapturedEntryToIntroAndTail(entry, sourceIntroReference, currentIntroReference, tailGapToAnimEnd, layerOutPoint, anchorToIntroStart) {
    if (!entry || !entry.prop || !entry.items || entry.items.length < 2) return { moved: 0, props: 0 };
    if (!sourceIntroReference || !currentIntroReference) return { moved: 0, props: 0 };
    if (!isFinite(sourceIntroReference.lastT) || !isFinite(currentIntroReference.lastT)) return { moved: 0, props: 0 };
    if (!isFinite(layerOutPoint)) return { moved: 0, props: 0 };

    var useIntroStart = anchorToIntroStart === true;
    var sourceAnchor = useIntroStart ? Number(sourceIntroReference.firstT) : Number(sourceIntroReference.lastT);
    var currentAnchor = useIntroStart ? Number(currentIntroReference.firstT) : Number(currentIntroReference.lastT);
    if (!isFinite(sourceAnchor) || !isFinite(currentAnchor)) return { moved: 0, props: 0 };

    var targetStart = currentAnchor + (Number(entry.firstT) - sourceAnchor);
    var targetEnd = Number(layerOutPoint) - Number(tailGapToAnimEnd);
    if (!isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) {
        targetEnd = targetStart + (Number(entry.lastT) - Number(entry.firstT));
    }
    if (!isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) {
        return { moved: 0, props: 0 };
    }

    var moved = _retimeCapturedKeyRangeToWindow(entry.prop, entry, targetStart, targetEnd);
    return { moved: moved, props: moved > 0 ? 1 : 0 };
}

function _nudgeTrackingEntryInsideLayer(layer, comp, trackingProp) {
    if (!layer || !comp || !trackingProp) return { moved: 0, props: 0 };
    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var currentTracking = _captureAllPropKeys(trackingProp);
    if (!currentTracking || !isFinite(currentTracking.firstT) || !isFinite(currentTracking.lastT)) return { moved: 0, props: 0 };

    var targetIn = Number(layer.inPoint);
    var targetOut = Number(layer.outPoint);
    if (!isFinite(targetIn) || !isFinite(targetOut) || !(targetOut > targetIn)) return { moved: 0, props: 0 };

    var span = Number(currentTracking.lastT) - Number(currentTracking.firstT);
    var layerSpan = targetOut - targetIn;
    if (!(span > 0) || layerSpan <= 0) return { moved: 0, props: 0 };

    // Preserve the original tracking shape. If the full tracking span cannot fit
    // inside the current layer as a simple block move, leave it untouched here
    // rather than retiming it and changing the preset structure.
    if (span > layerSpan + 0.000001) {
        return { moved: 0, props: 0 };
    }

    var shift = 0;
    if (currentTracking.firstT < targetIn) {
        shift = targetIn - currentTracking.firstT;
    } else if (currentTracking.lastT > targetOut) {
        shift = targetOut - currentTracking.lastT;
    }

    if (!isFinite(shift) || Math.abs(shift) < 0.000001) return { moved: 0, props: 0 };

    var shiftedFirst = currentTracking.firstT + shift;
    var shiftedLast = currentTracking.lastT + shift;

    if (shiftedFirst < targetIn) {
        shift += (targetIn - shiftedFirst);
        shiftedFirst = targetIn;
        shiftedLast = currentTracking.lastT + shift;
    }
    if (shiftedLast > targetOut) {
        shift -= (shiftedLast - targetOut);
        shiftedLast = targetOut;
        shiftedFirst = currentTracking.firstT + shift;
    }

    if (shiftedFirst < targetIn - 0.000001 || shiftedLast > targetOut + 0.000001) {
        return { moved: 0, props: 0 };
    }

    var items = [];
    for (var i = 0; i < currentTracking.items.length; i++) {
        items.push({
            idx: currentTracking.items[i].idx,
            oldT: currentTracking.items[i].oldT,
            newT: currentTracking.items[i].oldT + shift
        });
    }
    var moved = _retimePropWithMappedTimes(trackingProp, items, 1);
    return { moved: moved, props: moved > 0 ? 1 : 0 };
}

function _isOffsetSelectorIntroProp(prop) {
    if (!prop) return false;
    var label = _propLabelLower(prop);
    var match = "";
    try { match = String(prop.matchName || "").toLowerCase(); } catch (eM) { match = ""; }
    return (label.indexOf("offset") !== -1 || match.indexOf("percent offset") !== -1);
}

function _retimeCapturedKeyRangeToWindow(prop, capturedRange, targetStart, targetEnd) {
    if (!prop || !capturedRange || !capturedRange.items || capturedRange.items.length < 2) return 0;
    if (!(capturedRange.lastT > capturedRange.firstT)) return 0;

    var targetSpan = targetEnd - targetStart;
    if (!(targetSpan > 0)) return 0;

    var sourceSpan = capturedRange.lastT - capturedRange.firstT;
    var ratio = targetSpan / sourceSpan;
    var invRatio = (ratio !== 0) ? (1 / ratio) : 1;
    var items = [];
    for (var i = 0; i < capturedRange.items.length; i++) {
        items.push({
            idx: capturedRange.items[i].idx,
            oldT: capturedRange.items[i].oldT,
            newT: targetStart + ((capturedRange.items[i].oldT - capturedRange.firstT) * ratio)
        });
    }

    var moved = 0;
    items.sort(function (a, b) { return b.oldT - a.oldT; });
    for (i = 0; i < items.length; i++) {
        try {
            prop.setKeyTime(items[i].idx, items[i].newT);
            moved++;
        } catch (eMove) {}
    }

    if (moved >= items.length) return moved;
    return _retimePropWithMappedTimes(prop, items, invRatio);
}

function _retimePropRangeToWindow(prop, targetStart, targetEnd, frameDur) {
    if (!prop) return 0;

    var intro = _collectLikelyIntroKeyItems(prop, frameDur);
    if (!intro || !(intro.lastT > intro.firstT)) return 0;

    var targetSpan = targetEnd - targetStart;
    if (!(targetSpan > 0)) return 0;

    var sourceSpan = intro.lastT - intro.firstT;
    var ratio = targetSpan / sourceSpan;
    var invRatio = (ratio !== 0) ? (1 / ratio) : 1;
    var items = intro.items;
    for (var k = 0; k < items.length; k++) {
        items[k].newT = targetStart + ((items[k].oldT - intro.firstT) * ratio);
    }

    var moved = 0;
    items.sort(function (a, b) { return b.oldT - a.oldT; });
    for (var i = 0; i < items.length; i++) {
        try {
            prop.setKeyTime(items[i].idx, items[i].newT);
            moved++;
        } catch (eMove) {}
    }

    if (moved >= items.length) return moved;
    return _retimePropWithMappedTimes(prop, items, invRatio);
}

function _stretchPropKeysToRange(prop, targetIn, targetDur, frameDuration) {
    var keys = [];
    var i;
    for (var kAll = 1; kAll <= (prop.numKeys || 0); kAll++) keys.push(kAll);
    if (!keys || keys.length < 2) return 0;

    var keyData = [];
    for (i = 0; i < keys.length; i++) keyData.push({ idx: keys[i], t: prop.keyTime(keys[i]) });
    keyData.sort(function (a, b) { return a.t - b.t; });

    var firstT = keyData[0].t;
    var lastT = keyData[keyData.length - 1].t;
    if (lastT <= firstT) return 0;

    var srcDur = lastT - firstT;
    var ratio = targetDur / srcDur;
    var invRatio = (ratio !== 0) ? (1 / ratio) : 1;

    var snap = [];
    for (i = 0; i < keyData.length; i++) {
        var k = keyData[i].idx;
        var s = {
            oldT: keyData[i].t,
            newT: targetIn + ((keyData[i].t - firstT) * ratio),
            val: null,
            inInterp: null,
            outInterp: null,
            inEase: null,
            outEase: null,
            tempAuto: null,
            tempCont: null,
            roving: null,
            inSpatial: null,
            outSpatial: null,
            spAuto: null,
            spCont: null
        };
        try { s.val = prop.keyValue(k); } catch (eV) {}
        try { s.inInterp = prop.keyInInterpolationType(k); } catch (eIi) {}
        try { s.outInterp = prop.keyOutInterpolationType(k); } catch (eOi) {}
        try { s.inEase = prop.keyInTemporalEase(k); } catch (eIe) {}
        try { s.outEase = prop.keyOutTemporalEase(k); } catch (eOe) {}
        try { s.tempAuto = prop.keyTemporalAutoBezier(k); } catch (eTa) {}
        try { s.tempCont = prop.keyTemporalContinuous(k); } catch (eTc) {}
        try { s.roving = prop.keyRoving(k); } catch (eRv) {}
        try { s.inSpatial = prop.keyInSpatialTangent(k); } catch (eIst) {}
        try { s.outSpatial = prop.keyOutSpatialTangent(k); } catch (eOst) {}
        try { s.spAuto = prop.keySpatialAutoBezier(k); } catch (eSa) {}
        try { s.spCont = prop.keySpatialContinuous(k); } catch (eSc) {}
        snap.push(s);
    }

    try {
        var newTimes = [];
        var values = [];
        for (i = 0; i < snap.length; i++) {
            newTimes.push(snap[i].newT);
            values.push(snap[i].val);
        }

        for (i = prop.numKeys; i >= 1; i--) {
            try { prop.removeKey(i); } catch (eRemAll) {}
        }

        prop.setValuesAtTimes(newTimes, values);

        var applied = 0;
        var nNow = 0;
        try { nNow = prop.numKeys || 0; } catch (eNN) { nNow = 0; }
        var nApply = Math.min(nNow, snap.length);

        for (i = 1; i <= nApply; i++) {
            var d = snap[i - 1];
            try {
                if (d.inInterp !== null && d.outInterp !== null) {
                    prop.setInterpolationTypeAtKey(i, d.inInterp, d.outInterp);
                }
            } catch (eSetInterp) {}

            try {
                if (_shouldRestoreTemporalEase(d.inInterp, d.outInterp, d.tempAuto) && d.inEase !== null && d.outEase !== null) {
                    var scaledIn = [];
                    var scaledOut = [];
                    for (var ei = 0; ei < d.inEase.length; ei++) {
                        var ie = d.inEase[ei];
                        var oe = d.outEase[Math.min(ei, d.outEase.length - 1)];
                        scaledIn.push(new KeyframeEase(ie.speed * invRatio, ie.influence));
                        scaledOut.push(new KeyframeEase(oe.speed * invRatio, oe.influence));
                    }
                    prop.setTemporalEaseAtKey(i, scaledIn, scaledOut);
                }
            } catch (eSetEase) {}

            try { if (d.tempAuto !== null) prop.setTemporalAutoBezierAtKey(i, d.tempAuto); } catch (eSetTa) {}
            try { if (d.tempCont !== null) prop.setTemporalContinuousAtKey(i, d.tempCont); } catch (eSetTc) {}
            try { if (d.roving !== null) prop.setRovingAtKey(i, d.roving); } catch (eSetRv) {}
            try {
                if (d.inSpatial !== null && d.outSpatial !== null) {
                    prop.setSpatialTangentsAtKey(i, d.inSpatial, d.outSpatial);
                }
            } catch (eSetSp) {}
            try { if (d.spAuto !== null) prop.setSpatialAutoBezierAtKey(i, d.spAuto); } catch (eSetSa) {}
            try { if (d.spCont !== null) prop.setSpatialContinuousAtKey(i, d.spCont); } catch (eSetSc) {}
            try { prop.setSelectedAtKey(i, true); } catch (eSel) {}
            applied++;
        }
        return applied;
    } catch (eBulk) {
        try { _stretchLastError = eBulk.toString(); } catch (eErr2) {}
        return 0;
    }
}
function _stretchSelectedKeysOnPropToRange(prop, targetIn, targetDur) {
    if (!prop) return 0;
    var sel = [];
    try { sel = (prop.selectedKeys && prop.selectedKeys.length) ? prop.selectedKeys : []; } catch (eSel) { sel = []; }
    if (!sel || sel.length < 2) return 0;

    var keyData = [];
    for (var i = 0; i < sel.length; i++) {
        var idx = sel[i];
        try { keyData.push({ idx: idx, t: prop.keyTime(idx) }); } catch (eKT) {}
    }
    if (keyData.length < 2) return 0;
    keyData.sort(function (a, b) { return a.t - b.t; });

    var firstT = keyData[0].t;
    var lastT = keyData[keyData.length - 1].t;
    if (!(lastT > firstT)) return 0;

    var ratio = targetDur / (lastT - firstT);
    var remap = [];
    for (var r = 0; r < keyData.length; r++) {
        remap.push({
            idx: keyData[r].idx,
            oldT: keyData[r].t,
            newT: targetIn + ((keyData[r].t - firstT) * ratio)
        });
    }

    remap.sort(function (a, b) { return b.oldT - a.oldT; });
    var moved = 0;
    for (var m = 0; m < remap.length; m++) {
        try {
            prop.setKeyTime(remap[m].idx, remap[m].newT);
            moved++;
        } catch (eMove) {
            try { _stretchLastError = eMove.toString(); } catch (eErr) {}
        }
    }
    return moved;
}

function _hasSelectedKeyRanges(layer) {
    if (!layer) return false;
    var found = false;
    _forEachAnimatedProperty(layer, function (prop) {
        var nSel = 0;
        try { nSel = (prop.selectedKeys && prop.selectedKeys.length) ? prop.selectedKeys.length : 0; } catch (eSel) { nSel = 0; }
        if (nSel >= 2) {
            found = true;
            return true;
        }
        return false;
    });
    return found;
}

function _collectKeyframedPropsRecursive(group, outArr) {
    if (!group || !outArr) return;
    if (typeof group.numProperties === "undefined") return;
    for (var i = 1; i <= group.numProperties; i++) {
        var p = null;
        try { p = group.property(i); } catch (e0) { p = null; }
        if (!p) continue;

        var hasChildren = (typeof p.numProperties !== "undefined" && p.numProperties > 0);
        if (hasChildren) {
            _collectKeyframedPropsRecursive(p, outArr);
        } else {
            try {
                if (p.numKeys && p.numKeys > 0) outArr.push(p);
            } catch (e1) {}
        }
    }
}

function _stretchAllLayerKeyframesToSpan(layer, targetIn, targetOut, frameDuration) {
    if (!layer) return { moved: 0, props: 0 };
    if (!(targetOut > targetIn)) return { moved: 0, props: 0 };

    var props = [];
    _collectKeyframedPropsRecursive(layer, props);
    if (!props || props.length === 0) return { moved: 0, props: 0 };

    var firstT = null, lastT = null;
    for (var p = 0; p < props.length; p++) {
        var pr = props[p];
        if (!pr || pr.numKeys < 2) continue;
        var t1 = pr.keyTime(1);
        var tN = pr.keyTime(pr.numKeys);
        if (firstT === null || t1 < firstT) firstT = t1;
        if (lastT === null || tN > lastT) lastT = tN;
    }

    if (firstT === null || lastT === null || !(lastT > firstT)) {
        var earliest = null;
        for (var p2 = 0; p2 < props.length; p2++) {
            var pr2 = props[p2];
            if (!pr2 || pr2.numKeys < 1) continue;
            var t = pr2.keyTime(1);
            if (earliest === null || t < earliest) earliest = t;
        }
        if (earliest === null) return { moved: 0, props: 0 };

        var offset = targetIn - earliest;
        var moved1 = 0, props1 = 0;
        for (var p3 = 0; p3 < props.length; p3++) {
            var pr3 = props[p3];
            if (!pr3 || pr3.numKeys < 1) continue;
            var changed = false;
            for (var k = pr3.numKeys; k >= 1; k--) {
                try {
                    pr3.setKeyTime(k, pr3.keyTime(k) + offset);
                    moved1++;
                    changed = true;
                } catch (eMove) {}
            }
            if (changed) props1++;
        }
        return { moved: moved1, props: props1 };
    }

    var srcSpan = lastT - firstT;
    var dstSpan = Math.max(frameDuration || 0.001, targetOut - targetIn);
    var moved = 0, affectedProps = 0;
    for (var i = 0; i < props.length; i++) {
        var prop = props[i];
        var n = prop.numKeys;
        if (n < 1) continue;

        var newTimes = [];
        for (var k2 = 1; k2 <= n; k2++) {
            var ot = prop.keyTime(k2);
            var norm = (ot - firstT) / srcSpan;
            newTimes.push(targetIn + (norm * dstSpan));
        }

        var changed2 = false;
        for (var kr = n; kr >= 1; kr--) {
            try {
                prop.setKeyTime(kr, newTimes[kr - 1]);
                moved++;
                changed2 = true;
            } catch (eSet) {}
        }
        if (changed2) affectedProps++;
    }
    return { moved: moved, props: affectedProps };
}

function _shiftAllLayerKeyframesByDelta(layer, deltaSec) {
    if (!layer || !isFinite(deltaSec) || Math.abs(deltaSec) < 0.000001) return { moved: 0, props: 0 };

    var props = [];
    _collectKeyframedPropsRecursive(layer, props);
    if (!props || props.length === 0) return { moved: 0, props: 0 };

    var moved = 0;
    var affectedProps = 0;
    for (var i = 0; i < props.length; i++) {
        var prop = props[i];
        if (!prop || !prop.numKeys || prop.numKeys < 1) continue;
        var changed = false;
        for (var k = prop.numKeys; k >= 1; k--) {
            try {
                prop.setKeyTime(k, prop.keyTime(k) + deltaSec);
                moved++;
                changed = true;
            } catch (eShift) {}
        }
        if (changed) affectedProps++;
    }
    return { moved: moved, props: affectedProps };
}

function _findRigLayersForClip(comp, clipLayer) {
    var result = { nulls: [], adjs: [] };
    if (!comp || !clipLayer) return result;

    var maxScan = 15;
    for (var i = clipLayer.index - 1; i >= 1 && (clipLayer.index - i) <= maxScan; i--) {
        var l = null;
        try { l = comp.layer(i); } catch (e0) { l = null; }
        if (!l) continue;
        try {
            if (l.adjustmentLayer === true) result.adjs.push(l);
            if (l.nullLayer === true) result.nulls.push(l);
            else if (((l.name || "") + "").toLowerCase().indexOf("null") !== -1) result.nulls.push(l);
        } catch (e1) {}
    }
    return result;
}

function _selectAllLayerKeys(layer) {
    if (!layer) return 0;
    var selected = 0;
    _forEachAnimatedProperty(layer, function (prop) {
        var n = 0;
        try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
        if (n < 1) return false;
        for (var k = 1; k <= n; k++) {
            try { prop.setSelectedAtKey(k, true); selected++; } catch (eSel) {}
        }
        return false;
    });
    return selected;
}

function _shouldRestoreTemporalEase(inInterp, outInterp, tempAuto) {
    if (tempAuto === true) return true;
    try {
        if (typeof KeyframeInterpolationType !== "undefined") {
            if (inInterp === KeyframeInterpolationType.BEZIER) return true;
            if (outInterp === KeyframeInterpolationType.BEZIER) return true;
        }
    } catch (eInterp) {}
    return false;
}

function _retimePropWithMappedTimes(prop, items, speedScale) {
    if (!prop || !items || items.length < 1) return 0;

    var scale = (typeof speedScale === "number" && isFinite(speedScale) && speedScale > 0) ? speedScale : 1;

    var map = {};
    for (var i = 0; i < items.length; i++) map[items[i].idx] = items[i].newT;

    var n = 0;
    try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
    if (n < 1) return 0;

    var snap = [];
    for (var k = 1; k <= n; k++) {
        var s = {
            oldIdx: k,
            newT: null,
            val: null,
            inInterp: null,
            outInterp: null,
            inEase: null,
            outEase: null,
            tempAuto: null,
            tempCont: null,
            roving: null,
            inSpatial: null,
            outSpatial: null,
            spAuto: null,
            spCont: null
        };
        try { s.newT = (map[k] !== undefined) ? map[k] : prop.keyTime(k); } catch (eT) { s.newT = null; }
        try { s.val = prop.keyValue(k); } catch (eV) {}
        try { s.inInterp = prop.keyInInterpolationType(k); } catch (eIi) {}
        try { s.outInterp = prop.keyOutInterpolationType(k); } catch (eOi) {}
        try { s.inEase = prop.keyInTemporalEase(k); } catch (eIe) {}
        try { s.outEase = prop.keyOutTemporalEase(k); } catch (eOe) {}
        try { s.tempAuto = prop.keyTemporalAutoBezier(k); } catch (eTa) {}
        try { s.tempCont = prop.keyTemporalContinuous(k); } catch (eTc) {}
        try { s.roving = prop.keyRoving(k); } catch (eRv) {}
        try { s.inSpatial = prop.keyInSpatialTangent(k); } catch (eIst) {}
        try { s.outSpatial = prop.keyOutSpatialTangent(k); } catch (eOst) {}
        try { s.spAuto = prop.keySpatialAutoBezier(k); } catch (eSa) {}
        try { s.spCont = prop.keySpatialContinuous(k); } catch (eSc) {}
        if (s.newT !== null) snap.push(s);
    }

    if (snap.length < 1) return 0;

    try {
        var times = [];
        var vals = [];
        for (var a = 0; a < snap.length; a++) {
            times.push(snap[a].newT);
            vals.push(snap[a].val);
        }

        for (var r = n; r >= 1; r--) {
            try { prop.removeKey(r); } catch (eRem) {}
        }

        prop.setValuesAtTimes(times, vals);

        var rebuilt = 0;
        var nNow = 0;
        try { nNow = prop.numKeys || 0; } catch (eNow) { nNow = 0; }
        var nApply = Math.min(nNow, snap.length);
        for (var j = 1; j <= nApply; j++) {
            var d = snap[j - 1];
            try { if (d.inInterp !== null && d.outInterp !== null) prop.setInterpolationTypeAtKey(j, d.inInterp, d.outInterp); } catch (eSI) {}
            try {
                if (_shouldRestoreTemporalEase(d.inInterp, d.outInterp, d.tempAuto) && d.inEase !== null && d.outEase !== null) {
                    var inScaled = [];
                    var outScaled = [];
                    for (var ei = 0; ei < d.inEase.length; ei++) {
                        var ie = d.inEase[ei];
                        var oe = d.outEase[Math.min(ei, d.outEase.length - 1)];
                        inScaled.push(new KeyframeEase(ie.speed * scale, ie.influence));
                        outScaled.push(new KeyframeEase(oe.speed * scale, oe.influence));
                    }
                    prop.setTemporalEaseAtKey(j, inScaled, outScaled);
                }
            } catch (eSE) {}
            try { if (d.tempAuto !== null) prop.setTemporalAutoBezierAtKey(j, d.tempAuto); } catch (eTA) {}
            try { if (d.tempCont !== null) prop.setTemporalContinuousAtKey(j, d.tempCont); } catch (eTC) {}
            try { if (d.roving !== null) prop.setRovingAtKey(j, d.roving); } catch (eRV) {}
            try { if (d.inSpatial !== null && d.outSpatial !== null) prop.setSpatialTangentsAtKey(j, d.inSpatial, d.outSpatial); } catch (eST) {}
            try { if (d.spAuto !== null) prop.setSpatialAutoBezierAtKey(j, d.spAuto); } catch (eSA) {}
            try { if (d.spCont !== null) prop.setSpatialContinuousAtKey(j, d.spCont); } catch (eSC) {}
            rebuilt++;
        }
        return rebuilt;
    } catch (eBulk) {
        try { _stretchLastError = eBulk.toString(); } catch (eErr) {}
        return 0;
    }
}

function _stretchSingleLayerToOwnSpan(layer, comp, useSelectedKeysOnly) {
    if (!layer || !comp) return { moved: 0, props: 0 };

    var targetIn = layer.inPoint;
    var targetOut = layer.outPoint;
    var targetDur = Math.max(comp.frameDuration, targetOut - targetIn);
    if (!(targetDur > 0)) return { moved: 0, props: 0 };

    var entries = [];
    var globalFirst = null;
    var globalLast = null;

    _forEachAnimatedProperty(layer, function (prop) {
        var n = 0;
        try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
        if (n < 1) return false;

        var keys = [];
        if (useSelectedKeysOnly === true) {
            try {
                if (prop.selectedKeys && prop.selectedKeys.length >= 2) {
                    for (var sk = 0; sk < prop.selectedKeys.length; sk++) keys.push(prop.selectedKeys[sk]);
                }
            } catch (eSel) {}
            if (keys.length < 2) return false;
        } else {
            for (var k = 1; k <= n; k++) keys.push(k);
        }

        var items = [];
        for (var i = 0; i < keys.length; i++) {
            var idx = keys[i];
            var t = 0;
            try { t = prop.keyTime(idx); } catch (eKT) { continue; }
            var inEase = null, outEase = null, tempAuto = null;
            try { inEase = prop.keyInTemporalEase(idx); } catch (eIE) { inEase = null; }
            try { outEase = prop.keyOutTemporalEase(idx); } catch (eOE) { outEase = null; }
            try { tempAuto = prop.keyTemporalAutoBezier(idx); } catch (eTA) { tempAuto = null; }
            items.push({ idx: idx, oldT: t, newT: t, inEase: inEase, outEase: outEase, tempAuto: tempAuto });
            if (globalFirst === null || t < globalFirst) globalFirst = t;
            if (globalLast === null || t > globalLast) globalLast = t;
        }

        if (items.length > 0) entries.push({ prop: prop, items: items });
        return false;
    });

    if (!entries || entries.length === 0 || globalFirst === null || globalLast === null) {
        return { moved: 0, props: 0 };
    }

    var span = globalLast - globalFirst;
    var ratio = (span > 0) ? (targetDur / span) : 1;
    var invRatio = (ratio !== 0) ? (1 / ratio) : 1;
    var offset = targetIn - globalFirst;

    var movedKeys = 0;
    var affectedProps = 0;
    for (var e = 0; e < entries.length; e++) {
        var entry = entries[e];
        var movedOnProp = 0;

        for (var j = 0; j < entry.items.length; j++) {
            var it = entry.items[j];
            it.newT = (span > 0) ? (targetIn + ((it.oldT - globalFirst) * ratio)) : (it.oldT + offset);
        }

        entry.items.sort(function (a, b) { return b.oldT - a.oldT; });
        for (var m = 0; m < entry.items.length; m++) {
            try {
                if (typeof entry.prop.setKeyTime === "function") {
                    entry.prop.setKeyTime(entry.items[m].idx, entry.items[m].newT);
                    movedKeys++;
                    movedOnProp++;
                }
            } catch (eMove) {
                try { _stretchLastError = eMove.toString(); } catch (eErr) {}
            }
        }

        if (movedOnProp > 0) {
            for (var es = 0; es < entry.items.length; es++) {
                var ee = entry.items[es];
                if (!_shouldRestoreTemporalEase(ee.inInterp, ee.outInterp, ee.tempAuto) || ee.inEase === null || ee.outEase === null) continue;
                try {
                    var inScaled2 = [];
                    var outScaled2 = [];
                    for (var ei2 = 0; ei2 < ee.inEase.length; ei2++) {
                        var ie2 = ee.inEase[ei2];
                        var oe2 = ee.outEase[Math.min(ei2, ee.outEase.length - 1)];
                        inScaled2.push(new KeyframeEase(ie2.speed * invRatio, ie2.influence));
                        outScaled2.push(new KeyframeEase(oe2.speed * invRatio, oe2.influence));
                    }
                    entry.prop.setTemporalEaseAtKey(ee.idx, inScaled2, outScaled2);
                } catch (eEase) {}
            }
        }

        if (movedOnProp < 1) {
            var rebuilt = _retimePropWithMappedTimes(entry.prop, entry.items, invRatio);
            if (rebuilt > 0) {
                movedKeys += rebuilt;
                movedOnProp += rebuilt;
            }
        }

        if (movedOnProp > 0) affectedProps++;
    }

    return { moved: movedKeys, props: affectedProps };
}

function stretchCaptionLayersKeyframes(captionPrefix, selectedOnly) {
    app.beginUndoGroup("Stretch Caption Layers Keyframes");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var prefix = _unescapeJSONString(captionPrefix || "Caption ");
        if (!prefix || prefix.length < 1) prefix = "Caption ";

        var useSelected = (selectedOnly === true || selectedOnly === "true");
        var pool = [];
        if (useSelected) {
            pool = _getSelectedLayers(comp);
        } else {
            for (var i = 1; i <= comp.numLayers; i++) {
                try { pool.push(comp.layer(i)); } catch (eL) {}
            }
        }

        var targets = [];
        var pfx = ("" + prefix).toLowerCase();
        for (var p = 0; p < pool.length; p++) {
            var lyr = pool[p];
            if (!lyr) continue;
            var nm = "";
            try { nm = (lyr.name || "") + ""; } catch (eN) { nm = ""; }
            if (nm.toLowerCase().indexOf(pfx) === 0) targets.push(lyr);
        }

        if (!targets || targets.length < 1) {
            return "Error: No caption layers found with prefix '" + prefix + "'.";
        }

        var movedKeys = 0;
        var affectedProps = 0;
        var affectedLayers = 0;
        for (var t = 0; t < targets.length; t++) {
            var res = _stretchSingleLayerToOwnSpan(targets[t], comp, false);
            if (res && res.moved > 0) {
                movedKeys += res.moved;
                affectedProps += res.props;
                affectedLayers++;
                try { _selectAllLayerKeys(targets[t]); } catch (eSel) {}
            }
        }

        if (movedKeys < 1) return "Error: No editable keyed properties found on caption layers.";
        return "Stretched " + movedKeys + " keyframe(s) across " + affectedProps + " properties on " + affectedLayers + " caption layer(s).";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function stretchLayerKeyframesByIndex(layerIndex) {
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var idx = _aeSafeInt(layerIndex, 0);
        if (idx < 1 || idx > comp.numLayers) return "Error: Invalid layer index.";

        var layer = null;
        try { layer = comp.layer(idx); } catch (eL) { layer = null; }
        if (!layer) return "Error: Layer not found.";

        var res = _stretchSingleLayerToOwnSpan(layer, comp, false);
        if (!res || res.moved < 1) {
            return "Error: No editable keyed properties found on target layer.";
        }

        try { _selectAllLayerKeys(layer); } catch (eSel) {}
        return "Stretched " + res.moved + " keyframe(s) across " + res.props + " properties on target layer.";
    } catch (e) {
        return "Error: " + e.toString();
    }
}

function _retimeLayerIntroToSpeechWindow(layer, comp, speechStartSec, speechEndSec) {
    if (!layer || !comp) return { moved: 0, props: 0 };

    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var targetIntroStart = Number(speechStartSec);
    var targetIntroEnd = Number(speechEndSec);
    if (!isFinite(targetIntroStart)) targetIntroStart = layer.inPoint;
    if (!isFinite(targetIntroEnd)) targetIntroEnd = targetIntroStart + frameDur;
    targetIntroStart = Math.max(layer.inPoint, targetIntroStart);
    targetIntroEnd = Math.max(targetIntroStart + frameDur, targetIntroEnd);

    var movedKeys = 0;
    var affectedProps = 0;

    _forEachAnimatedProperty(layer, function (prop) {
        if (!_isLikelySpeechSyncedIntroProp(prop, layer, frameDur)) return false;

        var movedOnProp = _retimePropRangeToWindow(prop, targetIntroStart, targetIntroEnd, frameDur);
        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
        }
        return false;
    });

    return { moved: movedKeys, props: affectedProps };
}

function _retimeLayerIntroToSpeechWindowChain(layer, comp, speechStartSec, speechEndSec) {
    if (!layer || !comp) return { moved: 0, props: 0 };

    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var targetIntroStart = Number(speechStartSec);
    var targetIntroEnd = Number(speechEndSec);
    if (!isFinite(targetIntroStart)) targetIntroStart = layer.inPoint;
    if (!isFinite(targetIntroEnd)) targetIntroEnd = targetIntroStart + frameDur;
    targetIntroStart = Math.max(layer.inPoint, targetIntroStart);
    targetIntroEnd = Math.max(targetIntroStart + frameDur, targetIntroEnd);

    var movedKeys = 0;
    var affectedProps = 0;

    _forEachAnimatedProperty(layer, function (prop) {
        if (!_isLikelySpeechSyncedIntroProp(prop, layer, frameDur)) return false;

        var intro = _collectChainIntroKeyItems(prop, frameDur);
        if (!intro || !intro.items || intro.items.length < 2) return false;

        var movedOnProp = _retimeCapturedKeyRangeToWindow(prop, intro, targetIntroStart, targetIntroEnd);
        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
        }
        return false;
    });

    return { moved: movedKeys, props: affectedProps };
}

function _getLayerIntroBoundaryBounds(layer, comp) {
    if (!layer || !comp) return { min: null, max: null };

    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var minBoundary = null;
    var maxBoundary = null;

    _forEachAnimatedProperty(layer, function (prop) {
        if (!_isLikelySpeechSyncedIntroProp(prop, layer, frameDur)) return false;
        var intro = _collectChainIntroKeyItems(prop, frameDur);
        if (!intro || !intro.items || intro.items.length < 2) return false;
        if (minBoundary === null || intro.lastT < minBoundary) minBoundary = intro.lastT;
        if (maxBoundary === null || intro.lastT > maxBoundary) maxBoundary = intro.lastT;
        return false;
    });

    return { min: minBoundary, max: maxBoundary };
}

function _shiftPropKeysAfterTime(prop, boundaryTime, deltaSec) {
    if (!prop || !isFinite(boundaryTime) || !isFinite(deltaSec) || Math.abs(deltaSec) < 0.000001) {
        return { moved: 0, firstNew: null, lastNew: null };
    }

    var epsilon = 0.000001;
    var n = 0;
    try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
    if (n < 1) return { moved: 0, firstNew: null, lastNew: null };

    var items = [];
    for (var k = 1; k <= n; k++) {
        var oldT = null;
        try { oldT = prop.keyTime(k); } catch (eT) { oldT = null; }
        if (oldT === null || !isFinite(oldT)) continue;
        if (oldT <= (boundaryTime + epsilon)) continue;
        items.push({
            idx: k,
            oldT: oldT,
            newT: oldT + deltaSec
        });
    }

    if (items.length < 1) return { moved: 0, firstNew: null, lastNew: null };

    var moved = 0;
    items.sort(function (a, b) { return b.oldT - a.oldT; });
    for (var i = 0; i < items.length; i++) {
        try {
            prop.setKeyTime(items[i].idx, items[i].newT);
            moved++;
        } catch (eMove) {}
    }

    if (moved < items.length) {
        moved = _retimePropWithMappedTimes(prop, items, 1);
    }

    if (moved < 1) return { moved: 0, firstNew: null, lastNew: null };

    var firstNew = null;
    var lastNew = null;
    for (var j = 0; j < items.length; j++) {
        if (firstNew === null || items[j].newT < firstNew) firstNew = items[j].newT;
        if (lastNew === null || items[j].newT > lastNew) lastNew = items[j].newT;
    }

    return { moved: moved, firstNew: firstNew, lastNew: lastNew };
}

function _shiftLayerKeysAfterBoundary(layer, comp, boundaryTime, deltaSec) {
    if (!layer || !comp || !isFinite(boundaryTime) || !isFinite(deltaSec) || Math.abs(deltaSec) < 0.000001) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var epsilon = Math.max(0.000001, frameDur * 0.02);
    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    _forEachAnimatedProperty(layer, function (prop) {
        var shifted = null;
        if (_isLikelySpeechSyncedIntroProp(prop, layer, frameDur)) {
            var intro = _collectChainIntroKeyItems(prop, frameDur);
            if (intro && intro.items && intro.items.length > 0) {
                var introSkip = {};
                var localBoundary = isFinite(intro.lastT) ? intro.lastT : boundaryTime;
                for (var ii = 0; ii < intro.items.length; ii++) {
                    introSkip[intro.items[ii].idx] = true;
                }

                var n = 0;
                try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
                var items = [];
                for (var k = 1; k <= n; k++) {
                    if (introSkip[k]) continue;
                    var oldT = null;
                    try { oldT = prop.keyTime(k); } catch (eT) { oldT = null; }
                    if (oldT === null || !isFinite(oldT)) continue;
                    if (oldT <= (localBoundary + epsilon)) continue;
                    items.push({
                        idx: k,
                        oldT: oldT,
                        newT: oldT + deltaSec
                    });
                }

                if (items.length > 0) {
                    var movedOnProp = 0;
                    items.sort(function (a, b) { return b.oldT - a.oldT; });
                    for (var i = 0; i < items.length; i++) {
                        try {
                            prop.setKeyTime(items[i].idx, items[i].newT);
                            movedOnProp++;
                        } catch (eMove) {}
                    }

                    if (movedOnProp < items.length) {
                        movedOnProp = _retimePropWithMappedTimes(prop, items, 1);
                    }

                    if (movedOnProp > 0) {
                        var localFirst = null;
                        var localLast = null;
                        for (var m = 0; m < items.length; m++) {
                            if (localFirst === null || items[m].newT < localFirst) localFirst = items[m].newT;
                            if (localLast === null || items[m].newT > localLast) localLast = items[m].newT;
                        }
                        shifted = { moved: movedOnProp, firstNew: localFirst, lastNew: localLast };
                    }
                }
            }
        }

        if (!shifted) {
            shifted = _shiftPropKeysAfterTime(prop, boundaryTime, deltaSec);
        }
        if (shifted && shifted.moved > 0) {
            movedKeys += shifted.moved;
            affectedProps++;
            if (firstNew === null || (shifted.firstNew !== null && shifted.firstNew < firstNew)) firstNew = shifted.firstNew;
            if (lastNew === null || (shifted.lastNew !== null && shifted.lastNew > lastNew)) lastNew = shifted.lastNew;
        }
        return false;
    });

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _shiftLayerKeysAfterBoundaryUsingIntroProp(layer, comp, boundaryTime, deltaSec, introProp) {
    if (!layer || !comp || !isFinite(boundaryTime) || !isFinite(deltaSec) || Math.abs(deltaSec) < 0.000001) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var epsilon = Math.max(0.000001, frameDur * 0.02);
    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    _forEachAnimatedProperty(layer, function (prop) {
        var shifted = null;

        if (introProp && prop === introProp) {
            var n = 0;
            try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
            if (n > 0) {
                var intro = _collectChainIntroKeyItems(prop, frameDur);
                var introSkip = {};
                var localBoundary = boundaryTime;
                if (intro && intro.items && intro.items.length > 0) {
                    localBoundary = intro.lastT;
                    for (var ii = 0; ii < intro.items.length; ii++) {
                        introSkip[intro.items[ii].idx] = true;
                    }
                }

                var items = [];
                for (var k = 1; k <= n; k++) {
                    if (introSkip[k]) continue;
                    var oldT = null;
                    try { oldT = prop.keyTime(k); } catch (eT) { oldT = null; }
                    if (oldT === null || !isFinite(oldT)) continue;
                    if (oldT + epsilon < localBoundary) continue;
                    items.push({
                        idx: k,
                        oldT: oldT,
                        newT: oldT + deltaSec
                    });
                }

                if (items.length > 0) {
                    var movedOnProp = 0;
                    items.sort(function (a, b) { return b.oldT - a.oldT; });
                    for (var i = 0; i < items.length; i++) {
                        try {
                            prop.setKeyTime(items[i].idx, items[i].newT);
                            movedOnProp++;
                        } catch (eMove) {}
                    }

                    if (movedOnProp < items.length) {
                        movedOnProp = _retimePropWithMappedTimes(prop, items, 1);
                    }

                    if (movedOnProp > 0) {
                        var localFirst = null;
                        var localLast = null;
                        for (var m = 0; m < items.length; m++) {
                            if (localFirst === null || items[m].newT < localFirst) localFirst = items[m].newT;
                            if (localLast === null || items[m].newT > localLast) localLast = items[m].newT;
                        }
                        shifted = { moved: movedOnProp, firstNew: localFirst, lastNew: localLast };
                    }
                }
            }
        }

        if (!shifted) {
            shifted = _shiftPropKeysAfterTime(prop, boundaryTime, deltaSec);
        }
        if (shifted && shifted.moved > 0) {
            movedKeys += shifted.moved;
            affectedProps++;
            if (firstNew === null || (shifted.firstNew !== null && shifted.firstNew < firstNew)) firstNew = shifted.firstNew;
            if (lastNew === null || (shifted.lastNew !== null && shifted.lastNew > lastNew)) lastNew = shifted.lastNew;
        }
        return false;
    });

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _shiftLayerKeysAfterBoundaryUsingCapturedIntros(layer, comp, sourceEntries, currentEntries, defaultBoundary, defaultDelta) {
    if (!layer || !comp || !sourceEntries || !currentEntries || !sourceEntries.length || !currentEntries.length) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var epsilon = Math.max(0.000001, frameDur * 0.02);
    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    _forEachAnimatedProperty(layer, function (prop) {
        var shifted = null;
        var sourceEntry = _findCapturedEntryByProp(sourceEntries, prop);
        var currentEntry = _findCapturedEntryByProp(currentEntries, prop);

        if (sourceEntry && currentEntry && currentEntry.items && currentEntry.items.length > 0) {
            var localDelta = Number(currentEntry.lastT) - Number(sourceEntry.lastT);
            if (isFinite(localDelta) && Math.abs(localDelta) >= epsilon) {
                var n = 0;
                try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
                if (n > 0) {
                    var introSkip = {};
                    for (var ii = 0; ii < currentEntry.items.length; ii++) {
                        introSkip[currentEntry.items[ii].idx] = true;
                    }

                    var items = [];
                    for (var k = 1; k <= n; k++) {
                        if (introSkip[k]) continue;
                        var oldT = null;
                        try { oldT = prop.keyTime(k); } catch (eT) { oldT = null; }
                        if (oldT === null || !isFinite(oldT)) continue;
                        items.push({
                            idx: k,
                            oldT: oldT,
                            newT: oldT + localDelta
                        });
                    }

                    if (items.length > 0) {
                        var movedOnProp = 0;
                        items.sort(function (a, b) { return b.oldT - a.oldT; });
                        for (var i = 0; i < items.length; i++) {
                            try {
                                prop.setKeyTime(items[i].idx, items[i].newT);
                                movedOnProp++;
                            } catch (eMove) {}
                        }

                        if (movedOnProp < items.length) {
                            movedOnProp = _retimePropWithMappedTimes(prop, items, 1);
                        }

                        if (movedOnProp > 0) {
                            var localFirst = null;
                            var localLast = null;
                            for (var m = 0; m < items.length; m++) {
                                if (localFirst === null || items[m].newT < localFirst) localFirst = items[m].newT;
                                if (localLast === null || items[m].newT > localLast) localLast = items[m].newT;
                            }
                            shifted = { moved: movedOnProp, firstNew: localFirst, lastNew: localLast };
                        }
                    }
                }
            }
        }

        if (!shifted && isFinite(defaultBoundary) && isFinite(defaultDelta) && Math.abs(defaultDelta) >= epsilon) {
            shifted = _shiftPropKeysAfterTime(prop, defaultBoundary, defaultDelta);
        }
        if (shifted && shifted.moved > 0) {
            movedKeys += shifted.moved;
            affectedProps++;
            if (firstNew === null || (shifted.firstNew !== null && shifted.firstNew < firstNew)) firstNew = shifted.firstNew;
            if (lastNew === null || (shifted.lastNew !== null && shifted.lastNew > lastNew)) lastNew = shifted.lastNew;
        }
        return false;
    });

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _isLikelySpeechSyncedOutroProp(prop, layer, frameDur) {
    if (!prop || !layer) return false;

    var n = 0;
    try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
    if (n < 2) return false;

    var label = _propLabelLower(prop);
    var match = "";
    try { match = String(prop.matchName || "").toLowerCase(); } catch (eM) { match = ""; }

    if (label.indexOf("tracking") !== -1 || match.indexOf("tracking") !== -1) return false;

    var isSelectorProp = _propChainContains(prop, ["range selector", "selector", "text animator"]);
    if (isSelectorProp) {
        if (label.indexOf("offset") !== -1 || match.indexOf("percent offset") !== -1) return true;
        if (label.indexOf("start") !== -1 || match.indexOf("percent start") !== -1) return true;
        if (label.indexOf("end") !== -1 || match.indexOf("percent end") !== -1) return true;
    }

    if (label.indexOf("opacity") !== -1 || match.indexOf("opacity") !== -1) return true;
    if (label.indexOf("scale") !== -1) return true;
    if (label.indexOf("blur") !== -1) return true;
    return false;
}

function _collectLikelyOutroKeyItems(prop, frameDur) {
    if (!prop) return null;

    var n = 0;
    try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
    if (n < 2) return null;

    var items = [];
    for (var k = 1; k <= n; k++) {
        var t = 0;
        var v = null;
        try { t = prop.keyTime(k); } catch (eT) { continue; }
        try { v = prop.keyValue(k); } catch (eV) { v = null; }
        items.push({ idx: k, oldT: t, newT: t, val: v });
    }
    if (items.length < 2) return null;

    var label = _propLabelLower(prop);

    if (label.indexOf("scale") !== -1) {
        if (items.length >= 2) {
            return {
                items: [items[items.length - 2], items[items.length - 1]],
                firstT: items[items.length - 2].oldT,
                lastT: items[items.length - 1].oldT
            };
        }
    }

    if (label.indexOf("blur") !== -1 || label.indexOf("opacity") !== -1) {
        var gapLimit = Math.max((frameDur || 0.001) * 8, 0.10);
        var direction = 0;
        var d;
        for (var b = items.length - 1; b > 0; b--) {
            var prevVal = Number(items[b - 1].val);
            var nextVal = Number(items[b].val);
            if (!isFinite(prevVal) || !isFinite(nextVal)) continue;
            d = nextVal - prevVal;
            if (Math.abs(d) < 0.01) continue;
            direction = d > 0 ? 1 : -1;
            break;
        }

        if (direction !== 0) {
            var outroItems = [items[items.length - 1]];
            for (b = items.length - 1; b > 0; b--) {
                var current = items[b];
                var previous = items[b - 1];
                if ((current.oldT - previous.oldT) > gapLimit && outroItems.length >= 2) break;

                var previousValue = Number(previous.val);
                var currentValue = Number(current.val);
                if (isFinite(previousValue) && isFinite(currentValue)) {
                    d = currentValue - previousValue;
                    if (direction > 0 && d < -0.01 && outroItems.length >= 2) break;
                    if (direction < 0 && d > 0.01 && outroItems.length >= 2) break;
                }

                outroItems.unshift(previous);
            }

            // Include one earlier hold key when the preset keeps the value steady
            // just before the visible fade-out starts.
            if (outroItems.length >= 2) {
                var firstOutroIdx = outroItems[0].idx - 1;
                if (firstOutroIdx >= 1) {
                    var anchorItem = items[firstOutroIdx - 1];
                    if (anchorItem) {
                        var firstOutroValue = Number(outroItems[0].val);
                        var anchorValue = Number(anchorItem.val);
                        var anchorGap = outroItems[0].oldT - anchorItem.oldT;
                        var anchorGapLimit = Math.max(gapLimit * 3, (frameDur || 0.001) * 18, 0.24);
                        if (isFinite(firstOutroValue) && isFinite(anchorValue) && Math.abs(firstOutroValue - anchorValue) < 0.01 && anchorGap <= anchorGapLimit) {
                            outroItems.unshift(anchorItem);
                        }
                    }
                }
            }

            if (outroItems.length >= 2) {
                return {
                    items: outroItems,
                    firstT: outroItems[0].oldT,
                    lastT: outroItems[outroItems.length - 1].oldT
                };
            }
        }
    }

    if (items.length === 2) {
        return {
            items: items,
            firstT: items[0].oldT,
            lastT: items[1].oldT
        };
    }

    if (items.length === 3) {
        return {
            items: [items[1], items[2]],
            firstT: items[1].oldT,
            lastT: items[2].oldT
        };
    }

    var clusterStart = items.length - 2;
    var maxClusterGap = Math.max((frameDur || 0.001) * 8, 0.08);
    for (var i = items.length - 2; i > 0; i--) {
        var gap = items[i].oldT - items[i - 1].oldT;
        if (gap > maxClusterGap) {
            clusterStart = i;
            break;
        }
        clusterStart = i - 1;
    }

    var outroItems = items.slice(clusterStart);
    if (outroItems.length < 2) {
        outroItems = [items[items.length - 2], items[items.length - 1]];
    }

    return {
        items: outroItems,
        firstT: outroItems[0].oldT,
        lastT: outroItems[outroItems.length - 1].oldT
    };
}

function _captureChainOutroItems(layer, comp, minStartTime) {
    if (!layer || !comp) return { entries: [], earliestStart: null, latestEnd: null };

    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var minStart = isFinite(minStartTime) ? Number(minStartTime) : null;
    var epsilon = Math.max(0.000001, frameDur * 0.02);
    var entries = [];
    var earliestStart = null;
    var latestEnd = null;

    _forEachAnimatedProperty(layer, function (prop) {
        if (!_isLikelySpeechSyncedOutroProp(prop, layer, frameDur)) return false;
        var outro = _collectLikelyOutroKeyItems(prop, frameDur);
        if (!outro || !outro.items || outro.items.length < 2) return false;
        if (minStart !== null) {
            if (!isFinite(outro.lastT) || outro.lastT <= (minStart + epsilon)) return false;
        }
        entries.push({ prop: prop, items: outro.items, firstT: outro.firstT, lastT: outro.lastT });
        if (earliestStart === null || outro.firstT < earliestStart) earliestStart = outro.firstT;
        if (latestEnd === null || outro.lastT > latestEnd) latestEnd = outro.lastT;
        return false;
    });

    return { entries: entries, earliestStart: earliestStart, latestEnd: latestEnd };
}

function _shiftCapturedOutroItems(entries, deltaSec) {
    if (!entries || entries.length < 1 || !isFinite(deltaSec) || Math.abs(deltaSec) < 0.000001) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    for (var e = 0; e < entries.length; e++) {
        var entry = entries[e];
        if (!entry || !entry.prop || !entry.items || entry.items.length < 1) continue;

        var items = [];
        for (var i = 0; i < entry.items.length; i++) {
            items.push({
                idx: entry.items[i].idx,
                oldT: entry.items[i].oldT,
                newT: entry.items[i].oldT + deltaSec
            });
        }

        var movedOnProp = 0;
        items.sort(function (a, b) { return b.oldT - a.oldT; });
        for (var m = 0; m < items.length; m++) {
            try {
                entry.prop.setKeyTime(items[m].idx, items[m].newT);
                movedOnProp++;
            } catch (eMove) {}
        }

        if (movedOnProp < items.length) {
            movedOnProp = _retimePropWithMappedTimes(entry.prop, items, 1);
        }

        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
            for (var j = 0; j < items.length; j++) {
                if (firstNew === null || items[j].newT < firstNew) firstNew = items[j].newT;
                if (lastNew === null || items[j].newT > lastNew) lastNew = items[j].newT;
            }
        }
    }

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _pinCapturedOutroEndsToTime(entries, targetTime) {
    if (!entries || entries.length < 1 || !isFinite(targetTime)) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    for (var e = 0; e < entries.length; e++) {
        var entry = entries[e];
        if (!entry || !entry.prop || !entry.items || entry.items.length < 1) continue;

        var lastItem = entry.items[entry.items.length - 1];
        if (!lastItem || !isFinite(lastItem.oldT)) continue;

        var movedOnProp = 0;
        try {
            entry.prop.setKeyTime(lastItem.idx, targetTime);
            movedOnProp = 1;
        } catch (eMove) {
            movedOnProp = _retimePropWithMappedTimes(entry.prop, [{
                idx: lastItem.idx,
                oldT: lastItem.oldT,
                newT: targetTime
            }], 1);
        }

        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
            if (firstNew === null || targetTime < firstNew) firstNew = targetTime;
            if (lastNew === null || targetTime > lastNew) lastNew = targetTime;
        }
    }

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _alignScaleOutroEntries(entries, desiredOutroStart, targetEnd) {
    if (!entries || !isFinite(desiredOutroStart) || !isFinite(targetEnd) || !(targetEnd > desiredOutroStart)) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    for (var e = 0; e < entries.length; e++) {
        var entry = entries[e];
        if (!entry || !entry.prop || !entry.items || entry.items.length < 2) continue;
        if (_propLabelLower(entry.prop).indexOf("scale") === -1) continue;

        var desiredStart = desiredOutroStart;
        var sourceFirst = entry.firstT;
        var sourceLast = entry.lastT;
        if (!isFinite(sourceFirst) || !isFinite(sourceLast) || !(sourceLast > sourceFirst)) continue;

        var items = [];
        for (var i = 0; i < entry.items.length; i++) {
            var oldT = entry.items[i].oldT;
            // Behold preset-struktur: Flytt relativt til desiredStart
            var newT = desiredStart + (oldT - sourceFirst);
            items.push({
                idx: entry.items[i].idx,
                oldT: oldT,
                newT: newT
            });
        }
        // Fjern overstyring for å bevare struktur

        var movedOnProp = 0;
        items.sort(function (a, b) { return b.oldT - a.oldT; });
        for (var m = 0; m < items.length; m++) {
            try {
                entry.prop.setKeyTime(items[m].idx, items[m].newT);
                movedOnProp++;
            } catch (eMove) {}
        }

        if (movedOnProp < items.length) {
            movedOnProp = _retimePropWithMappedTimes(entry.prop, items, 1);
        }

        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
            for (var j = 0; j < items.length; j++) {
                if (firstNew === null || items[j].newT < firstNew) firstNew = items[j].newT;
                if (lastNew === null || items[j].newT > lastNew) lastNew = items[j].newT;
            }
        }
    }

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _alignCapturedOutroEntriesToEnd(entries, targetEnd, allowedLabels) {
    if (!entries || !isFinite(targetEnd)) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    for (var e = 0; e < entries.length; e++) {
        var entry = entries[e];
        if (!entry || !entry.prop || !entry.items || entry.items.length < 2) continue;

        var entryLabel = _propLabelLower(entry.prop);
        if (allowedLabels && allowedLabels.length > 0) {
            var isAllowed = false;
            for (var a = 0; a < allowedLabels.length; a++) {
                if (entryLabel.indexOf(String(allowedLabels[a] || "").toLowerCase()) !== -1) {
                    isAllowed = true;
                    break;
                }
            }
            if (!isAllowed) continue;
        }

        var sourceFirst = entry.firstT;
        var sourceLast = entry.lastT;
        if (!isFinite(sourceFirst) || !isFinite(sourceLast) || !(sourceLast > sourceFirst)) continue;

        var sourceSpan = sourceLast - sourceFirst;
        var targetStart = targetEnd - sourceSpan;
        var items = [];
        for (var i = 0; i < entry.items.length; i++) {
            var oldT = entry.items[i].oldT;
            items.push({
                idx: entry.items[i].idx,
                oldT: oldT,
                newT: targetStart + (oldT - sourceFirst)
            });
        }

        var movedOnProp = 0;
        items.sort(function (a, b) { return b.oldT - a.oldT; });
        for (var m = 0; m < items.length; m++) {
            try {
                entry.prop.setKeyTime(items[m].idx, items[m].newT);
                movedOnProp++;
            } catch (eMove) {}
        }

        if (movedOnProp < items.length) {
            movedOnProp = _retimePropWithMappedTimes(entry.prop, items, 1);
        }

        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
            for (var j = 0; j < items.length; j++) {
                if (firstNew === null || items[j].newT < firstNew) firstNew = items[j].newT;
                if (lastNew === null || items[j].newT > lastNew) lastNew = items[j].newT;
            }
        }
    }

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _findCapturedOutroWindow(entries, labelNeedle) {
    if (!entries || !entries.length) return null;
    var needle = String(labelNeedle || "").toLowerCase();
    if (!needle.length) return null;

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry || !entry.prop) continue;
        var label = _propLabelLower(entry.prop);
        if (label.indexOf(needle) === -1) continue;
        if (!isFinite(entry.firstT) || !isFinite(entry.lastT)) continue;
        return { start: entry.firstT, end: entry.lastT };
    }

    return null;
}

function _findCapturedOutroEntry(entries, labelNeedle) {
    if (!entries || !entries.length) return null;
    var needle = String(labelNeedle || "").toLowerCase();
    if (!needle.length) return null;

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry || !entry.prop) continue;
        var label = _propLabelLower(entry.prop);
        if (label.indexOf(needle) === -1) continue;
        if (!isFinite(entry.firstT) || !isFinite(entry.lastT)) continue;
        return entry;
    }

    return null;
}

function _findCapturedIntroEntry(entries, labelNeedle) {
    return _findCapturedOutroEntry(entries, labelNeedle);
}

function _alignCapturedIntroEntriesRelativeToReference(sourceEntries, currentEntries, referenceLabel, allowedLabels) {
    if (!sourceEntries || !currentEntries || !sourceEntries.length || !currentEntries.length) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var sourceRef = _findCapturedIntroEntry(sourceEntries, referenceLabel);
    var currentRef = _findCapturedIntroEntry(currentEntries, referenceLabel);
    if (!sourceRef || !currentRef) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    for (var e = 0; e < sourceEntries.length; e++) {
        var entry = sourceEntries[e];
        if (!entry || !entry.prop || !entry.items || entry.items.length < 2) continue;

        var entryLabel = _propLabelLower(entry.prop);
        var isAllowed = false;
        for (var a = 0; a < allowedLabels.length; a++) {
            if (entryLabel.indexOf(String(allowedLabels[a] || "").toLowerCase()) !== -1) {
                isAllowed = true;
                break;
            }
        }
        if (!isAllowed) continue;

        var targetStart = currentRef.firstT + (entry.firstT - sourceRef.firstT);
        var targetEnd = currentRef.lastT + (entry.lastT - sourceRef.lastT);
        if (!isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) continue;

        var movedOnProp = _retimeCapturedKeyRangeToWindow(entry.prop, entry, targetStart, targetEnd);
        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
            if (firstNew === null || targetStart < firstNew) firstNew = targetStart;
            if (lastNew === null || targetEnd > lastNew) lastNew = targetEnd;
        }
    }

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _alignCapturedEntriesToReferenceWindow(sourceEntries, sourceReference, currentReference, allowedLabels) {
    if (!sourceEntries || !sourceEntries.length || !sourceReference || !currentReference) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }
    if (!isFinite(sourceReference.firstT) || !isFinite(sourceReference.lastT) || !isFinite(currentReference.firstT) || !isFinite(currentReference.lastT)) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    for (var e = 0; e < sourceEntries.length; e++) {
        var entry = sourceEntries[e];
        if (!entry || !entry.prop || !entry.items || entry.items.length < 2) continue;

        var entryLabel = _propLabelLower(entry.prop);
        var isAllowed = false;
        for (var a = 0; a < allowedLabels.length; a++) {
            if (entryLabel.indexOf(String(allowedLabels[a] || "").toLowerCase()) !== -1) {
                isAllowed = true;
                break;
            }
        }
        if (!isAllowed) continue;

        var targetStart = currentReference.firstT + (entry.firstT - sourceReference.firstT);
        var targetEnd = currentReference.lastT + (entry.lastT - sourceReference.lastT);
        if (!isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) continue;

        var movedOnProp = _retimeCapturedKeyRangeToWindow(entry.prop, entry, targetStart, targetEnd);
        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
            if (firstNew === null || targetStart < firstNew) firstNew = targetStart;
            if (lastNew === null || targetEnd > lastNew) lastNew = targetEnd;
        }
    }

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _alignCapturedFirstKeysToReferenceWindow(sourceEntries, sourceReference, currentReference, allowedLabels) {
    if (!sourceEntries || !sourceEntries.length || !sourceReference || !currentReference) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }
    if (!isFinite(sourceReference.firstT) || !isFinite(currentReference.firstT)) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    for (var e = 0; e < sourceEntries.length; e++) {
        var entry = sourceEntries[e];
        if (!entry || !entry.prop || !entry.items || entry.items.length < 1) continue;

        var entryLabel = _propLabelLower(entry.prop);
        var isAllowed = false;
        for (var a = 0; a < allowedLabels.length; a++) {
            if (entryLabel.indexOf(String(allowedLabels[a] || "").toLowerCase()) !== -1) {
                isAllowed = true;
                break;
            }
        }
        if (!isAllowed) continue;

        var firstItem = entry.items[0];
        if (!firstItem || !isFinite(firstItem.oldT)) continue;

        var targetStart = currentReference.firstT + (entry.firstT - sourceReference.firstT);
        if (!isFinite(targetStart)) continue;

        var movedOnProp = 0;
        try {
            entry.prop.setKeyTime(firstItem.idx, targetStart);
            movedOnProp = 1;
        } catch (eMove) {
            movedOnProp = _retimePropWithMappedTimes(entry.prop, [{
                idx: firstItem.idx,
                oldT: firstItem.oldT,
                newT: targetStart
            }], 1);
        }

        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
            if (firstNew === null || targetStart < firstNew) firstNew = targetStart;
            if (lastNew === null || targetStart > lastNew) lastNew = targetStart;
        }
    }

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _alignCapturedOutroEntriesToAnchoredEnd(sourceEntries, currentEntries, targetEnd, allowedLabels, sourceIntroReference, currentIntroReference, sourceOutroReference, currentOutroReference, sourceIntroEntries, currentIntroEntries) {
    if (!sourceEntries || !currentEntries || !sourceEntries.length || !currentEntries.length || !isFinite(targetEnd)) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    for (var e = 0; e < sourceEntries.length; e++) {
        var sourceEntry = sourceEntries[e];
        if (!sourceEntry || !sourceEntry.prop || !sourceEntry.items || sourceEntry.items.length < 2) continue;

        var entryLabel = _propLabelLower(sourceEntry.prop);
        var isAllowed = false;
        for (var a = 0; a < allowedLabels.length; a++) {
            if (entryLabel.indexOf(String(allowedLabels[a] || "").toLowerCase()) !== -1) {
                isAllowed = true;
                break;
            }
        }
        if (!isAllowed) continue;

        var targetStart = null;
        var sourceLocalIntro = _findCapturedEntryByProp(sourceIntroEntries, sourceEntry.prop);
        var currentLocalIntro = _findCapturedEntryByProp(currentIntroEntries, sourceEntry.prop);
        if (
            sourceLocalIntro &&
            currentLocalIntro &&
            isFinite(sourceLocalIntro.lastT) &&
            isFinite(currentLocalIntro.lastT)
        ) {
            var sourceGapFromIntro = sourceEntry.firstT - sourceLocalIntro.lastT;
            targetStart = currentLocalIntro.lastT + sourceGapFromIntro;
        } else if (
            sourceIntroReference &&
            currentIntroReference &&
            isFinite(sourceIntroReference.lastT) &&
            isFinite(currentIntroReference.lastT)
        ) {
            var sourceGapFromReference = sourceEntry.firstT - sourceIntroReference.lastT;
            targetStart = currentIntroReference.lastT + sourceGapFromReference;
        } else {
            var sourceSpan = sourceEntry.lastT - sourceEntry.firstT;
            if (!(sourceSpan > 0)) continue;
            targetStart = targetEnd - sourceSpan;
        }
        var localTargetEnd = targetEnd;
        var entryIsBlur = entryLabel.indexOf("blur") !== -1;
        if (
            !entryIsBlur &&
            sourceOutroReference &&
            currentOutroReference &&
            isFinite(sourceOutroReference.lastT) &&
            isFinite(currentOutroReference.lastT)
        ) {
            localTargetEnd = currentOutroReference.lastT + (sourceEntry.lastT - sourceOutroReference.lastT);
        }
        if (entryIsBlur) {
            localTargetEnd = targetStart + (sourceEntry.lastT - sourceEntry.firstT);
        }
        if (!isFinite(localTargetEnd) || targetStart >= localTargetEnd) continue;

        var movedOnProp = _retimeCapturedKeyRangeToWindow(sourceEntry.prop, sourceEntry, targetStart, localTargetEnd);

        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
            if (firstNew === null || targetStart < firstNew) firstNew = targetStart;
            if (lastNew === null || localTargetEnd > lastNew) lastNew = localTargetEnd;
        }
    }

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _moveCapturedOutroEntriesFromAnchoredStart(sourceEntries, currentEntries, allowedLabels, sourceIntroReference, currentIntroReference, sourceIntroEntries, currentIntroEntries) {
    if (!sourceEntries || !sourceEntries.length) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    for (var e = 0; e < sourceEntries.length; e++) {
        var sourceEntry = sourceEntries[e];
        if (!sourceEntry || !sourceEntry.prop || !sourceEntry.items || sourceEntry.items.length < 2) continue;

        var entryLabel = _propLabelLower(sourceEntry.prop);
        var isAllowed = false;
        for (var a = 0; a < allowedLabels.length; a++) {
            if (entryLabel.indexOf(String(allowedLabels[a] || "").toLowerCase()) !== -1) {
                isAllowed = true;
                break;
            }
        }
        if (!isAllowed) continue;

        var sourceLocalIntro = _findCapturedEntryByProp(sourceIntroEntries, sourceEntry.prop);
        var currentLocalIntro = _findCapturedEntryByProp(currentIntroEntries, sourceEntry.prop);
        var targetStart = null;
        if (
            sourceLocalIntro &&
            currentLocalIntro &&
            isFinite(sourceLocalIntro.lastT) &&
            isFinite(currentLocalIntro.lastT)
        ) {
            targetStart = currentLocalIntro.lastT + (sourceEntry.firstT - sourceLocalIntro.lastT);
        } else if (
            sourceIntroReference &&
            currentIntroReference &&
            isFinite(sourceIntroReference.lastT) &&
            isFinite(currentIntroReference.lastT)
        ) {
            targetStart = currentIntroReference.lastT + (sourceEntry.firstT - sourceIntroReference.lastT);
        }
        if (!isFinite(targetStart)) continue;

        var targetEnd = targetStart + (sourceEntry.lastT - sourceEntry.firstT);
        if (!(targetEnd > targetStart)) continue;

        var movedOnProp = _retimeCapturedKeyRangeToWindow(sourceEntry.prop, sourceEntry, targetStart, targetEnd);
        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
            if (firstNew === null || targetStart < firstNew) firstNew = targetStart;
            if (lastNew === null || targetEnd > lastNew) lastNew = targetEnd;
        }
    }

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _hasAllowedCapturedEntries(entries, allowedLabels) {
    if (!entries || !entries.length || !allowedLabels || !allowedLabels.length) return false;
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry || !entry.prop) continue;
        var label = _propLabelLower(entry.prop);
        for (var a = 0; a < allowedLabels.length; a++) {
            if (label.indexOf(String(allowedLabels[a] || "").toLowerCase()) !== -1) return true;
        }
    }
    return false;
}

function _findCapturedEntryByProp(entries, prop) {
    if (!entries || !entries.length || !prop) return null;
    for (var i = 0; i < entries.length; i++) {
        if (entries[i] && entries[i].prop === prop) return entries[i];
    }
    return null;
}

function _alignCapturedOutroEntriesRelativeToReference(sourceEntries, currentEntries, referenceLabel, allowedLabels) {
    if (!sourceEntries || !currentEntries || !sourceEntries.length || !currentEntries.length) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var sourceRef = _findCapturedOutroEntry(sourceEntries, referenceLabel);
    var currentRef = _findCapturedOutroEntry(currentEntries, referenceLabel);
    if (!sourceRef || !currentRef) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    for (var e = 0; e < sourceEntries.length; e++) {
        var entry = sourceEntries[e];
        if (!entry || !entry.prop || !entry.items || entry.items.length < 2) continue;

        var entryLabel = _propLabelLower(entry.prop);
        var isAllowed = false;
        for (var a = 0; a < allowedLabels.length; a++) {
            if (entryLabel.indexOf(String(allowedLabels[a] || "").toLowerCase()) !== -1) {
                isAllowed = true;
                break;
            }
        }
        if (!isAllowed) continue;

        var targetStart = currentRef.firstT + (entry.firstT - sourceRef.firstT);
        var targetEnd = currentRef.lastT + (entry.lastT - sourceRef.lastT);
        if (!isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) continue;

        var movedOnProp = _retimeCapturedKeyRangeToWindow(entry.prop, entry, targetStart, targetEnd);
        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
            if (firstNew === null || targetStart < firstNew) firstNew = targetStart;
            if (lastNew === null || targetEnd > lastNew) lastNew = targetEnd;
        }
    }

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _stretchCapturedOutroItemsToWindow(entries, targetStart, targetEnd) {
    if (!entries || entries.length < 1 || !isFinite(targetStart) || !isFinite(targetEnd) || !(targetEnd > targetStart)) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }
    var globalFirst = null;
    var globalLast = null;
    for (var g = 0; g < entries.length; g++) {
        var globalEntry = entries[g];
        if (!globalEntry || !isFinite(globalEntry.firstT) || !isFinite(globalEntry.lastT)) continue;
        if (globalFirst === null || globalEntry.firstT < globalFirst) globalFirst = globalEntry.firstT;
        if (globalLast === null || globalEntry.lastT > globalLast) globalLast = globalEntry.lastT;
    }
    if (!isFinite(globalFirst) || !isFinite(globalLast) || !(globalLast > globalFirst)) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var globalSourceSpan = globalLast - globalFirst;
    var globalTargetSpan = targetEnd - targetStart;
    if (!(globalTargetSpan > 0)) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var globalRatio = globalTargetSpan / globalSourceSpan;
    var invGlobalRatio = (globalRatio !== 0) ? (1 / globalRatio) : 1;
    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    for (var e = 0; e < entries.length; e++) {
        var entry = entries[e];
        if (!entry || !entry.prop || !entry.items || entry.items.length < 2) continue;

        var sourceFirst = entry.firstT;
        var sourceLast = entry.lastT;
        if (!isFinite(sourceFirst) || !isFinite(sourceLast) || !(sourceLast > sourceFirst)) continue;

        var entryLabel = _propLabelLower(entry.prop);
        var isBlurEntry = entryLabel.indexOf("blur") !== -1;
        var isScaleEntry = entryLabel.indexOf("scale") !== -1;
        var isOpacityEntry = entryLabel.indexOf("opacity") !== -1;
        var items = [];
        var localRatio = globalRatio;
        var localTargetStart = targetStart;
        var localInvRatio = invGlobalRatio;
        if ((isBlurEntry || isScaleEntry || isOpacityEntry) && isFinite(sourceFirst) && isFinite(sourceLast) && (sourceLast > sourceFirst)) {
            var localTargetEnd = targetEnd;
            var localSourceSpan = sourceLast - sourceFirst;
            var localTargetSpan = localTargetEnd - targetStart;
            if (localTargetSpan > 0 && localSourceSpan > 0) {
                localTargetStart = targetStart;
                if (isScaleEntry || isOpacityEntry || isBlurEntry) {
                    localRatio = 1;
                    localInvRatio = 1;
                } else {
                    localRatio = localTargetSpan / localSourceSpan;
                    localInvRatio = (localRatio !== 0) ? (1 / localRatio) : 1;
                }
            }
        }
        for (var i = 0; i < entry.items.length; i++) {
            var newT = null;
            if (isScaleEntry || isOpacityEntry || isBlurEntry) {
                newT = targetStart + (entry.items[i].oldT - sourceFirst);
            } else {
                newT = targetStart + ((entry.items[i].oldT - globalFirst) * globalRatio);
            }
            items.push({
                idx: entry.items[i].idx,
                oldT: entry.items[i].oldT,
                newT: newT
            });
        }

        var movedOnProp = 0;
        items.sort(function (a, b) { return b.oldT - a.oldT; });
        for (var m = 0; m < items.length; m++) {
            try {
                entry.prop.setKeyTime(items[m].idx, items[m].newT);
                movedOnProp++;
            } catch (eMove) {}
        }

        if (movedOnProp < items.length) {
            movedOnProp = _retimePropWithMappedTimes(entry.prop, items, (isBlurEntry || isScaleEntry || isOpacityEntry) ? localInvRatio : invGlobalRatio);
        }

        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
            for (var j = 0; j < items.length; j++) {
                if (firstNew === null || items[j].newT < firstNew) firstNew = items[j].newT;
                if (lastNew === null || items[j].newT > lastNew) lastNew = items[j].newT;
            }
        }
    }

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _isTrackingChainProp(prop) {
    if (!prop) return false;
    var label = _propLabelLower(prop);
    var match = "";
    try { match = String(prop.matchName || "").toLowerCase(); } catch (eM) { match = ""; }
    return (label.indexOf("tracking") !== -1 || match.indexOf("tracking") !== -1);
}

function _getLayerKeyTimeSpan(layer) {
    if (!layer) return { first: null, last: null };

    var first = null;
    var last = null;

    _forEachAnimatedProperty(layer, function (prop) {
        var n = 0;
        try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
        if (n < 1) return false;

        for (var k = 1; k <= n; k++) {
            var t = null;
            try { t = prop.keyTime(k); } catch (eT) { t = null; }
            if (t === null || !isFinite(t)) continue;
            if (first === null || t < first) first = t;
            if (last === null || t > last) last = t;
        }
        return false;
    });

    return { first: first, last: last };
}

function _getLayerKeyTimeSpanExcludingTracking(layer) {
    if (!layer) return { first: null, last: null };

    var first = null;
    var last = null;

    _forEachAnimatedProperty(layer, function (prop) {
        if (_isTrackingChainProp(prop)) return false;

        var n = 0;
        try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
        if (n < 1) return false;

        for (var k = 1; k <= n; k++) {
            var t = null;
            try { t = prop.keyTime(k); } catch (eT) { t = null; }
            if (t === null || !isFinite(t)) continue;
            if (first === null || t < first) first = t;
            if (last === null || t > last) last = t;
        }
        return false;
    });

    return { first: first, last: last };
}

function _retimeChainTrackingPropsToLayerSpan(layer, comp, targetEndOverride) {
    if (!layer || !comp) return { moved: 0, props: 0 };

    var targetStart = Number(layer.inPoint);
    var targetEnd = Number(targetEndOverride);
    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    if (!isFinite(targetStart)) targetStart = 0;
    if (!isFinite(targetEnd)) targetEnd = Number(layer.outPoint);
    if (!isFinite(targetEnd)) targetEnd = targetStart + frameDur;
    targetEnd = Math.max(targetStart + frameDur, targetEnd);

    var movedKeys = 0;
    var affectedProps = 0;

    _forEachAnimatedProperty(layer, function (prop) {
        if (!_isTrackingChainProp(prop)) return false;

        var n = 0;
        try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
        if (n < 2) return false;

        var movedOnProp = _retimePropRangeToWindow(prop, targetStart, targetEnd, frameDur);
        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
        }
        return false;
    });

    return { moved: movedKeys, props: affectedProps };
}

function _stretchLayerTailAfterBoundary(layer, comp, boundaryTime, targetOut, introProp) {
    if (!layer || !comp || !isFinite(boundaryTime) || !isFinite(targetOut) || !(targetOut > boundaryTime)) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var epsilon = Math.max(0.000001, frameDur * 0.02);
    var entries = [];
    var sourceFirst = null;
    var sourceLast = null;

    _forEachAnimatedProperty(layer, function (prop) {
        var n = 0;
        try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
        if (n < 1) return false;

        var localBoundary = boundaryTime;
        var introSkip = {};
        if (_isLikelySpeechSyncedIntroProp(prop, layer, frameDur)) {
            var intro = _collectChainIntroKeyItems(prop, frameDur);
            if (intro && intro.items && intro.items.length > 0) {
                if (prop === introProp && isFinite(intro.lastT)) localBoundary = intro.lastT;
                for (var ii = 0; ii < intro.items.length; ii++) {
                    introSkip[intro.items[ii].idx] = true;
                }
            }
        }

        var items = [];
        for (var k = 1; k <= n; k++) {
            if (introSkip[k]) continue;
            var oldT = null;
            try { oldT = prop.keyTime(k); } catch (eT) { oldT = null; }
            if (oldT === null || !isFinite(oldT)) continue;
            if (oldT <= (localBoundary + epsilon)) continue;
            items.push({ idx: k, oldT: oldT, newT: oldT });
            if (sourceFirst === null || oldT < sourceFirst) sourceFirst = oldT;
            if (sourceLast === null || oldT > sourceLast) sourceLast = oldT;
        }

        if (items.length > 0) entries.push({ prop: prop, items: items });
        return false;
    });

    if (!entries.length || sourceFirst === null || sourceLast === null) {
        return { moved: 0, props: 0, firstNew: null, lastNew: null };
    }

    var targetFirst = boundaryTime;
    var targetLast = Math.max(boundaryTime + frameDur, targetOut);
    var sourceSpan = sourceLast - sourceFirst;
    var targetSpan = targetLast - targetFirst;
    if (!(targetSpan > 0)) return { moved: 0, props: 0, firstNew: null, lastNew: null };

    var ratio = (sourceSpan > 0) ? (targetSpan / sourceSpan) : 1;
    var invRatio = (ratio !== 0) ? (1 / ratio) : 1;
    var movedKeys = 0;
    var affectedProps = 0;
    var firstNew = null;
    var lastNew = null;

    for (var e = 0; e < entries.length; e++) {
        var entry = entries[e];
        if (!entry || !entry.prop || !entry.items || !entry.items.length) continue;

        var itemsToMove = [];
        for (var i = 0; i < entry.items.length; i++) {
            var oldT = entry.items[i].oldT;
            var newT = null;
            if (i === entry.items.length - 1) {
                newT = targetLast;
            } else {
                newT = (sourceSpan > 0)
                    ? (targetFirst + ((oldT - sourceFirst) * ratio))
                    : targetFirst;
            }
            itemsToMove.push({ idx: entry.items[i].idx, oldT: oldT, newT: newT });
        }

        itemsToMove.sort(function (a, b) { return b.oldT - a.oldT; });
        var movedOnProp = 0;
        for (var m = 0; m < itemsToMove.length; m++) {
            try {
                entry.prop.setKeyTime(itemsToMove[m].idx, itemsToMove[m].newT);
                movedOnProp++;
            } catch (eMove) {}
        }

        if (movedOnProp < itemsToMove.length) {
            movedOnProp = _retimePropWithMappedTimes(entry.prop, itemsToMove, invRatio);
        }

        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
            for (var j = 0; j < itemsToMove.length; j++) {
                if (firstNew === null || itemsToMove[j].newT < firstNew) firstNew = itemsToMove[j].newT;
                if (lastNew === null || itemsToMove[j].newT > lastNew) lastNew = itemsToMove[j].newT;
            }
        }
    }

    return { moved: movedKeys, props: affectedProps, firstNew: firstNew, lastNew: lastNew };
}

function _chainOverlapShiftFadeProps(layer, comp, overlapFrames) {
    if (!layer || !comp) return { moved: 0, props: 0 };
    var frames = Number(overlapFrames);
    if (!isFinite(frames) || frames === 0) return { moved: 0, props: 0 };

    var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
    var deltaSec = -frames * frameDur;

    var movedKeys = 0;
    var affectedProps = 0;

    _forEachAnimatedProperty(layer, function (prop) {
        var label = _propLabelLower(prop);
        var isOpacity = label.indexOf("opacity") !== -1;
        var isBlur = label.indexOf("blur") !== -1;
        if (!isOpacity && !isBlur) return false;

        var n = 0;
        try { n = prop.numKeys || 0; } catch (eN) { n = 0; }
        if (n < 1) return false;

        var items = [];
        for (var k = 1; k <= n; k++) {
            var t = null;
            try { t = prop.keyTime(k); } catch (eT) { t = null; }
            if (t === null || !isFinite(t)) continue;
            items.push({ idx: k, oldT: t, newT: t + deltaSec });
        }
        if (items.length < 1) return false;

        if (deltaSec < 0) {
            items.sort(function (a, b) { return a.oldT - b.oldT; });
        } else {
            items.sort(function (a, b) { return b.oldT - a.oldT; });
        }

        var movedOnProp = 0;
        for (var i = 0; i < items.length; i++) {
            try {
                prop.setKeyTime(items[i].idx, items[i].newT);
                movedOnProp++;
            } catch (eM) {}
        }
        if (movedOnProp < items.length) {
            movedOnProp = _retimePropWithMappedTimes(prop, items, 1);
        }
        if (movedOnProp > 0) {
            movedKeys += movedOnProp;
            affectedProps++;
        }
        return false;
    });

    return { moved: movedKeys, props: affectedProps };
}

function retimeCaptionLayerByIndex(layerIndex, speechStartSec, speechEndSec, retimeMode, introSyncMode, targetOutSec) {
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";
        var frameDur = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);

        var idx = _aeSafeInt(layerIndex, 0);
        if (idx < 1 || idx > comp.numLayers) return "Error: Invalid layer index.";

        var layer = null;
        try { layer = comp.layer(idx); } catch (eL) { layer = null; }
        if (!layer) return "Error: Layer not found.";

        var mode = String(retimeMode || "");
        var syncMode = String(introSyncMode || "");
        var res = null;
        var stretchRes = null;
        var overlapIntroReferenceSnapshot = null;
        var overlapIntroEntriesSnapshot = null;
        var overlapStructureSnapshot = null;
        var overlapTrackingTailSnapshot = null;
        var overlapScaleTailSnapshot = null;
        var overlapSourceAnimationEnd = null;
        var overlapTrackingFullSnapshot = null;
        var overlapScaleFullSnapshot = null;
        var chainProfile = classifyChainPresetProfile(layer, comp);
        var chainProfileState = (chainProfile !== "generic_profile")
            ? captureChainProfileState(layer, comp, chainProfile)
            : null;

        var isChainOverlapMode = String(mode || "").toLowerCase() === "chainoverlap";
        var fadePresetSnapshot = null;
        var outroPresetSnapshot = null;
        if (isChainOverlapMode && chainProfile === "generic_profile") {
            outroPresetSnapshot = { entries: [] };
            try {
                var overlapIntroReferenceProp = _getPreferredChainIntroProp(layer, comp);
                if (overlapIntroReferenceProp) {
                    overlapIntroReferenceSnapshot = _collectChainIntroKeyItems(overlapIntroReferenceProp, frameDur);
                }
                overlapIntroEntriesSnapshot = _captureChainIntroItems(layer, comp);
                try {
                    var sourceKeySpan = _getLayerKeyTimeSpan(layer);
                    overlapSourceAnimationEnd = (sourceKeySpan && isFinite(sourceKeySpan.last)) ? sourceKeySpan.last : null;
                } catch (eSrcSpan) { overlapSourceAnimationEnd = null; }
                overlapStructureSnapshot = { entries: [] };
                _forEachAnimatedProperty(layer, function (prop) {
                    var lbl = _propLabelLower(prop);
                    var isOpacity = lbl.indexOf("opacity") !== -1;
                    var isBlur = lbl.indexOf("blur") !== -1;
                    var isScale = lbl.indexOf("scale") !== -1;
                    var isTracking = lbl.indexOf("tracking") !== -1 && lbl.indexOf("type") === -1;
                    if (isTracking && !overlapTrackingTailSnapshot) {
                        var trackingFull = _captureAllPropKeys(prop);
                        if (trackingFull && isFinite(trackingFull.lastT)) {
                            overlapTrackingFullSnapshot = trackingFull;
                            overlapTrackingTailSnapshot = {
                                prop: prop,
                                gapToAnimEnd: isFinite(overlapSourceAnimationEnd)
                                    ? Number(overlapSourceAnimationEnd) - Number(trackingFull.lastT)
                                    : Number(layer.outPoint) - Number(trackingFull.lastT)
                            };
                        }
                    }
                    if (isScale && !overlapScaleTailSnapshot) {
                        var scaleFull = _captureAllPropKeys(prop);
                        if (scaleFull && isFinite(scaleFull.lastT)) {
                            overlapScaleFullSnapshot = scaleFull;
                            overlapScaleTailSnapshot = {
                                prop: prop,
                                gapToAnimEnd: isFinite(overlapSourceAnimationEnd)
                                    ? Number(overlapSourceAnimationEnd) - Number(scaleFull.lastT)
                                    : Number(layer.outPoint) - Number(scaleFull.lastT)
                            };
                        }
                    }
                    if (!isOpacity && !isBlur && !isScale) return false;

                    var fullEntry = _captureAllPropKeys(prop);
                    if (fullEntry) {
                        overlapStructureSnapshot.entries.push(fullEntry);
                    }

                    var outro = _collectLikelyOutroKeyItems(prop, frameDur);
                    if (outro && outro.items && outro.items.length >= 2) {
                        outroPresetSnapshot.entries.push({ prop: prop, items: outro.items, firstT: outro.firstT, lastT: outro.lastT });
                    }
                    return false;
                });
            } catch (eSnapDist) {
                outroPresetSnapshot = null;
            }
        }

        if (isChainOverlapMode && isFinite(Number(targetOutSec))) {
            try {
                var overlapOutTarget = Number(targetOutSec);
                if (overlapOutTarget > Number(layer.outPoint)) {
                    layer.outPoint = overlapOutTarget;
                }
            } catch (eExtOut) {}
        }

        if (String(mode || "").toLowerCase() === "chain" && isFinite(Number(speechStartSec)) && isFinite(Number(speechEndSec))) {
            if (chainProfile === "selector_tracking_blur_opacity_family" && chainProfileState) {
                var familyIntroRes = _retimeChainProfileIntro(layer, comp, chainProfileState, speechStartSec, speechEndSec);
                var familyTailRes = _restoreChainProfileFamilyTail(layer, comp, chainProfileState);
                try { _applyChainProfileLayerTiming(layer, comp, speechStartSec, false); } catch (eFamilyTiming) {}
                if (chainProfileState.trackingFullEntry) {
                    try { _forceTrackingPropToChainSpan(chainProfileState.trackingFullEntry.prop, layer, comp); } catch (eFamilyTrackSpan) {}
                }
                try { _trimLayerOutToAnimatedSpan(layer, comp, 0, false); } catch (eFamilyTrim) {}
                try { _selectAllLayerKeys(layer); } catch (eSelFamily) {}

                var familyMsg = "";
                if (familyIntroRes && familyIntroRes.moved > 0) {
                    familyMsg += "Retimed intro on " + familyIntroRes.props + " properties across " + familyIntroRes.moved + " keyframe(s).";
                }
                if (familyTailRes && familyTailRes.moved > 0) {
                    if (familyMsg.length > 0) familyMsg += " ";
                    familyMsg += "Restored preset structure on " + familyTailRes.props + " properties across " + familyTailRes.moved + " keyframe(s).";
                }
                if (!familyMsg.length) familyMsg = "Chain retime completed.";
                return familyMsg;
            }
            if (chainProfile === "offset_selector_family" && chainProfileState) {
                var offsetDelta = Number(speechStartSec) - Number(chainProfileState.sourceLayerInPoint);
                var offsetShiftRes = _shiftAllLayerKeyframesByDelta(layer, offsetDelta);
                try {
                    if (isFinite(Number(speechStartSec))) {
                        try {
                            if (isFinite(Number(layer.startTime))) {
                                layer.startTime = Number(layer.startTime) + offsetDelta;
                            }
                        } catch (eOffsetStartTime) {}
                        layer.inPoint = Number(speechStartSec);
                    }
                } catch (eOffsetFamilyInPoint) {}
                try {
                    if (isFinite(offsetDelta)) {
                        layer.outPoint = Number(layer.outPoint) + offsetDelta;
                    }
                } catch (eOffsetFamilyOutShift) {}
                try { _trimLayerOutToAnimatedSpan(layer, comp, 0, false); } catch (eOffsetFamilyTrim) {}
                try { _selectAllLayerKeys(layer); } catch (eSelOffsetFamily) {}

                var offsetMsg = "";
                if (offsetShiftRes && offsetShiftRes.moved > 0) {
                    if (offsetMsg.length > 0) offsetMsg += " ";
                    offsetMsg += "Moved preset structure on " + offsetShiftRes.props + " properties across " + offsetShiftRes.moved + " keyframe(s).";
                }
                if (!offsetMsg.length) offsetMsg = "Chain retime completed.";
                return offsetMsg;
            }

            var shiftRes = null;
            var frameDurChain = (comp.frameDuration && comp.frameDuration > 0) ? comp.frameDuration : (1 / comp.frameRate);
            var tailPadding = frameDurChain * 2;
            var newIntroBoundary = null;
            var preferredIntroProp = _getPreferredChainIntroProp(layer, comp);
            var preferredIntroBefore = preferredIntroProp ? _collectChainIntroKeyItems(preferredIntroProp, frameDurChain) : null;
            var introEntriesBefore = _captureChainIntroItems(layer, comp);

            var boundsBefore = _getLayerIntroBoundaryBounds(layer, comp);
            var originalIntroEnd = (preferredIntroBefore && isFinite(preferredIntroBefore.lastT))
                ? preferredIntroBefore.lastT
                : (boundsBefore && isFinite(boundsBefore.max) ? boundsBefore.max : null);
            res = _retimeLayerIntroToSpeechWindow(layer, comp, speechStartSec, speechEndSec);
            var preferredIntroAfter = preferredIntroProp ? _collectChainIntroKeyItems(preferredIntroProp, frameDurChain) : null;
            var introEntriesAfter = _captureChainIntroItems(layer, comp);
            var boundsAfter = _getLayerIntroBoundaryBounds(layer, comp);
            newIntroBoundary = (preferredIntroAfter && isFinite(preferredIntroAfter.lastT))
                ? preferredIntroAfter.lastT
                : (boundsAfter && isFinite(boundsAfter.max) ? boundsAfter.max : Number(speechEndSec));
            if (!isFinite(newIntroBoundary)) newIntroBoundary = Number(speechStartSec) + frameDurChain;
            newIntroBoundary = Math.max(Number(speechStartSec) + frameDurChain, newIntroBoundary);

            if (isFinite(originalIntroEnd) && isFinite(newIntroBoundary)) {
                var deltaIntro = newIntroBoundary - originalIntroEnd;
                var shiftedRes = null;
                if (
                    introEntriesBefore &&
                    introEntriesBefore.entries &&
                    introEntriesBefore.entries.length > 0 &&
                    introEntriesAfter &&
                    introEntriesAfter.entries &&
                    introEntriesAfter.entries.length > 0
                ) {
                    shiftedRes = _shiftLayerKeysAfterBoundaryUsingCapturedIntros(
                        layer,
                        comp,
                        introEntriesBefore.entries,
                        introEntriesAfter.entries,
                        originalIntroEnd,
                        deltaIntro
                    );
                } else {
                    var useIntroPropShift = !!preferredIntroProp;
                    shiftedRes = useIntroPropShift
                        ? _shiftLayerKeysAfterBoundaryUsingIntroProp(layer, comp, originalIntroEnd, deltaIntro, preferredIntroProp)
                        : _shiftLayerKeysAfterBoundary(layer, comp, originalIntroEnd, deltaIntro);
                }
                if (shiftedRes && shiftedRes.moved > 0) shiftRes = shiftedRes;
            }

            var nonTrackingSpanAfter = null;
            try {
                nonTrackingSpanAfter = _getLayerKeyTimeSpanExcludingTracking(layer);
                var animationEnd = (nonTrackingSpanAfter && isFinite(nonTrackingSpanAfter.last)) ? nonTrackingSpanAfter.last : null;
                if (!isFinite(animationEnd)) {
                    var keySpanAfter = _getLayerKeyTimeSpan(layer);
                    animationEnd = (keySpanAfter && isFinite(keySpanAfter.last)) ? keySpanAfter.last : null;
                }
                if (isFinite(animationEnd)) {
                    var desiredOutPoint = _snapTimeUpToFrame(comp, animationEnd + tailPadding);
                    layer.outPoint = Math.max(layer.inPoint + comp.frameDuration, desiredOutPoint);
                }
            } catch (eOut) {}

            try { _selectAllLayerKeys(layer); } catch (eSelChain) {}
            var chainMsg = "";
            if (res && res.moved > 0) {
                chainMsg += "Retimed intro on " + res.props + " properties across " + res.moved + " keyframe(s).";
            }
            if (shiftRes && shiftRes.moved > 0) {
                if (chainMsg.length > 0) chainMsg += " ";
                chainMsg += "Shifted trailing keyframe(s) on " + shiftRes.props + " properties across " + shiftRes.moved + " keyframe(s).";
            }
            if (!chainMsg.length) chainMsg = "Chain retime completed.";
            return chainMsg;
        }

        stretchRes = _stretchSingleLayerToOwnSpan(layer, comp, false);

        if (isFinite(Number(speechStartSec)) && isFinite(Number(speechEndSec))) {
            var overlapFamilyTailRes = null;
            if (isChainOverlapMode && chainProfile === "selector_tracking_blur_opacity_family" && chainProfileState) {
                res = _retimeChainProfileIntro(layer, comp, chainProfileState, speechStartSec, speechEndSec);
                overlapFamilyTailRes = _restoreChainProfileFamilyTailForOverlap(layer, comp, chainProfileState);
                try { _applyChainProfileLayerTiming(layer, comp, speechStartSec, true); } catch (eFamilyOverlapTiming) {}
            } else {
                res = _retimeLayerIntroToSpeechWindow(layer, comp, speechStartSec, speechEndSec);
            }

            var currentIntroReferenceProp = null;
            var currentIntroReference = null;
            var currentIntroEntries = null;
            if (isChainOverlapMode && chainProfile === "generic_profile") {
                currentIntroReferenceProp = _getPreferredChainIntroProp(layer, comp);
                currentIntroReference = currentIntroReferenceProp
                    ? _collectChainIntroKeyItems(currentIntroReferenceProp, frameDur)
                    : null;
                currentIntroEntries = _captureChainIntroItems(layer, comp);
            }

            if (isChainOverlapMode && chainProfile === "generic_profile" && outroPresetSnapshot && outroPresetSnapshot.entries && outroPresetSnapshot.entries.length > 0) {
                try {
                    if (
                        overlapStructureSnapshot &&
                        overlapStructureSnapshot.entries &&
                        overlapStructureSnapshot.entries.length > 0 &&
                        overlapIntroReferenceSnapshot &&
                        currentIntroReference
                    ) {
                        var genericOverlapStructureDelta = Number(currentIntroReference.lastT) - Number(overlapIntroReferenceSnapshot.lastT);
                        if (isFinite(genericOverlapStructureDelta) && Math.abs(genericOverlapStructureDelta) >= 0.000001) {
                            _restoreCapturedFamilyEntriesWithDelta(overlapStructureSnapshot.entries, genericOverlapStructureDelta);
                        }
                    } else if (
                        overlapIntroReferenceSnapshot &&
                        currentIntroReference &&
                        _hasAllowedCapturedEntries(outroPresetSnapshot.entries, ["opacity", "blur"])
                    ) {
                        _moveCapturedOutroEntriesFromAnchoredStart(
                            outroPresetSnapshot.entries,
                            null,
                            ["blur", "opacity"],
                            overlapIntroReferenceSnapshot,
                            currentIntroReference,
                            overlapIntroEntriesSnapshot ? overlapIntroEntriesSnapshot.entries : null,
                            currentIntroEntries ? currentIntroEntries.entries : null
                        );
                    }

                } catch (eOutroAdjust) {}
            }

            if (isChainOverlapMode) {
                try {
                    _trimLayerOutToAnimatedSpan(
                        layer,
                        comp,
                        chainProfile === "selector_tracking_blur_opacity_family" ? 0 : 1,
                        chainProfile === "selector_tracking_blur_opacity_family"
                    );
                } catch (eOverlapTrim) {}
            }

            if (isChainOverlapMode && chainProfile === "generic_profile") {
                try {
                    if (
                        overlapScaleTailSnapshot &&
                        overlapScaleFullSnapshot &&
                        overlapIntroReferenceSnapshot &&
                        currentIntroReference &&
                        isFinite(overlapScaleTailSnapshot.gapToAnimEnd)
                    ) {
                        _retimeCapturedEntryToIntroAndTail(
                            overlapScaleFullSnapshot,
                            overlapIntroReferenceSnapshot,
                            currentIntroReference,
                            overlapScaleTailSnapshot.gapToAnimEnd,
                            Number(layer.outPoint),
                            true
                        );
                    }

                    if (
                        overlapTrackingTailSnapshot &&
                        overlapTrackingFullSnapshot &&
                        overlapIntroReferenceSnapshot &&
                        currentIntroReference &&
                        isFinite(overlapTrackingTailSnapshot.gapToAnimEnd)
                    ) {
                        _retimeCapturedEntryToIntroAndTail(
                            overlapTrackingFullSnapshot,
                            overlapIntroReferenceSnapshot,
                            currentIntroReference,
                            overlapTrackingTailSnapshot.gapToAnimEnd,
                            Number(layer.outPoint),
                            true
                        );
                    }
                } catch (eGenericTailAfterTrim) {}
            }

            if (isChainOverlapMode && chainProfile === "selector_tracking_blur_opacity_family" && chainProfileState && chainProfileState.trackingFullEntry) {
                try {
                    _forceTrackingPropToLayerSpan(chainProfileState.trackingFullEntry.prop, layer);
                } catch (eTrackingPostTrim) {}
                try {
                    _ensureTrackingEndpointsAtLayerSpan(chainProfileState.trackingFullEntry.prop, layer);
                } catch (eTrackingEndpoint) {}
            }

            if ((stretchRes && stretchRes.moved > 0) || (res && res.moved > 0)) {
                try { _selectAllLayerKeys(layer); } catch (eSel) {}
                var msg = "";
                if (stretchRes && stretchRes.moved > 0) {
                    msg += "Stretched " + stretchRes.moved + " keyframe(s) across " + stretchRes.props + " properties.";
                }
                if (res && res.moved > 0) {
                    if (msg.length > 0) msg += " ";
                    msg += "Retimed intro on " + res.props + " properties across " + res.moved + " keyframe(s).";
                }
                if (overlapFamilyTailRes && overlapFamilyTailRes.moved > 0) {
                    if (msg.length > 0) msg += " ";
                    msg += "Restored preset structure on " + overlapFamilyTailRes.props + " properties across " + overlapFamilyTailRes.moved + " keyframe(s).";
                }
                return msg;
            }
        }

        if (!stretchRes || stretchRes.moved < 1) {
            return "Error: No editable keyed properties found on target layer.";
        }

        try { _selectAllLayerKeys(layer); } catch (eSel2) {}
        return "Stretched " + stretchRes.moved + " keyframe(s) across " + stretchRes.props + " properties on target layer.";
    } catch (e) {
        return "Error: " + e.toString();
    }
}

function stretchSelectedLayersKeyframesToLayer() {
    app.beginUndoGroup("Stretch Keyframes To Layer");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var layers = _getSelectedLayers(comp);
        if (!layers || layers.length === 0) return "Error: Select one or more layers.";

        var movedKeys = 0;
        var affectedProps = 0;
        var affectedLayers = 0;
        var propsFound = 0;
        var setFailures = 0;

        for (var li = 0; li < layers.length; li++) {
            var layer = layers[li];
            if (!layer) continue;

            var targetIn = layer.inPoint;
            var targetOut = layer.outPoint;
            var targetDur = Math.max(comp.frameDuration, targetOut - targetIn);
            if (!(targetDur > 0)) continue;

            var layerMoved = 0;
            var layerProps = 0;
            _forEachAnimatedProperty(layer, function (propCountOnly) {
                var n = 0;
                try { n = propCountOnly.numKeys || 0; } catch (eN0) { n = 0; }
                if (n > 0) propsFound++;
                return false;
            });

            var layerRes = _stretchSingleLayerToOwnSpan(layer, comp, false);
            layerMoved = layerRes.moved;
            layerProps = layerRes.props;
            if (layerMoved < 1 && layerProps < 1) setFailures++;

            if (layerMoved > 0) {
                movedKeys += layerMoved;
                affectedProps += layerProps;
                affectedLayers++;
                try { _selectAllLayerKeys(layer); } catch (eSelectAll) {}
            }
        }

        if (movedKeys < 1 || affectedProps < 1) {
            return "Error: No editable keyed properties found on selected layers. (props found=" + propsFound + ", setKeyTime fails=" + setFailures + ")" + (_stretchLastError ? " [setKeyTime error: " + _stretchLastError + "]" : "");
        }

        return "Stretched " + movedKeys + " keyframe(s) across " + affectedProps + " properties on " + affectedLayers + " selected layer(s). (setKeyTime fails=" + setFailures + ")";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function trimSelectedLayersToKeyframes() {
    app.beginUndoGroup("Trim Layer To Keyframes");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var layers = _getSelectedLayers(comp);
        if (!layers || layers.length === 0) return "Error: Select one or more layers.";

        var changed = 0;
        for (var l = 0; l < layers.length; l++) {
            var layer = layers[l];

            // Use a plain object so the callback can reliably mutate it
            // (avoids the var-closure capture bug with null checks in inner functions)
            var range = { first: null, last: null };

            (function (capturedRange, capturedLayer) {
                _forEachAnimatedProperty(capturedLayer, function (prop) {
                    var keys = _collectSelectedOrAllKeys(prop, 1);
                    if (!keys || keys.length < 1) return false;
                    var t0 = prop.keyTime(keys[0]);
                    var t1 = prop.keyTime(keys[keys.length - 1]);
                    if (capturedRange.first === null || t0 < capturedRange.first) capturedRange.first = t0;
                    if (capturedRange.last  === null || t1 > capturedRange.last)  capturedRange.last  = t1;
                    return false;
                });
            })(range, layer);

            if (range.first !== null && range.last !== null && range.last > range.first) {
                layer.inPoint  = range.first;
                layer.outPoint = Math.max(range.first + comp.frameDuration, range.last);
                changed++;
            }
        }

        if (changed < 1) return "Error: No keyframes found on selected layers.";
        return "Trimmed " + changed + " layer(s) to keyframe range.";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function _findSelectedAudioLayer(comp) {
    var sel = _getSelectedLayers(comp);
    for (var i = 0; i < sel.length; i++) {
        try {
            if ((sel[i] instanceof AVLayer) && sel[i].hasAudio) return sel[i];
        } catch (e) {}
    }
    return null;
}

function _getAudioLayerMediaPath(layer) {
    try {
        var src = layer ? layer.source : null;
        var main = src ? src.mainSource : null;
        var file = main && main.file ? main.file : null;
        if (file && file.exists) return file.fsName || "";
    } catch (e) {}
    return "";
}

function _buildAudioLayerInfo(audioLayer, selectionSource) {
    if (!audioLayer) return null;

    var inPointSec = 0;
    var outPointSec = 0;
    var startTimeSec = 0;
    var sourceDurationSec = 0;
    var mediaPath = "";

    try { inPointSec = audioLayer.inPoint || 0; } catch (e0) { inPointSec = 0; }
    try { outPointSec = audioLayer.outPoint || 0; } catch (e1) { outPointSec = 0; }
    try { startTimeSec = audioLayer.startTime || 0; } catch (e2) { startTimeSec = 0; }
    try { sourceDurationSec = audioLayer.source && audioLayer.source.duration ? audioLayer.source.duration : 0; } catch (e3) { sourceDurationSec = 0; }
    try { mediaPath = _getAudioLayerMediaPath(audioLayer) || ""; } catch (e4) { mediaPath = ""; }

    return {
        layerIndex: audioLayer.index || 0,
        layerName: audioLayer.name || "Selected Audio",
        selectionSource: selectionSource || "fallback",
        inPointSec: inPointSec,
        outPointSec: outPointSec,
        startTimeSec: startTimeSec,
        layerDurationSec: Math.max(0, outPointSec - inPointSec),
        sourceDurationSec: Math.max(0, sourceDurationSec),
        sourceOffsetAtLayerInSec: Math.max(0, inPointSec - startTimeSec),
        mediaPath: mediaPath
    };
}

function _isPreferredCaptionAudioPath(pathStr) {
    var path = ("" + (pathStr || "")).toLowerCase();
    if (!path.length) return false;
    return /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(path);
}

function _findPreferredCaptionAudioLayer(comp) {
    if (!comp) return null;

    var selected = _findSelectedAudioLayer(comp);
    if (selected) return selected;

    var fallback = null;
    for (var i = 1; i <= comp.numLayers; i++) {
        try {
            var layer = comp.layer(i);
            if (!(layer && (layer instanceof AVLayer) && layer.hasAudio)) continue;
            var mediaPath = _getAudioLayerMediaPath(layer);
            if (_isPreferredCaptionAudioPath(mediaPath)) return layer;
            if (!fallback) fallback = layer;
        } catch (e0) {}
    }

    return fallback;
}

function _resolveBeatAudioLayer(comp, preferredLayerIndex, preferredMediaPath, preferredLayerName) {
    var wantedPath = ("" + (preferredMediaPath || "")).toLowerCase();
    var wantedName = ("" + (preferredLayerName || "")).toLowerCase();
    var hasSignature = !!(wantedPath || wantedName);
    var idx = parseInt(preferredLayerIndex, 10);

    function isAudioCandidate(layer) {
        try {
            return !!(layer && (layer instanceof AVLayer) && layer.hasAudio);
        } catch (e) {
            return false;
        }
    }

    function layerMatches(layer) {
        if (!isAudioCandidate(layer)) return false;

        if (wantedPath) {
            var layerPath = ("" + _getAudioLayerMediaPath(layer)).toLowerCase();
            if (layerPath && layerPath === wantedPath) return true;
        }

        if (wantedName) {
            var layerName = ("" + (layer.name || "")).toLowerCase();
            if (layerName === wantedName) return true;
        }

        return false;
    }

    if (!isNaN(idx) && idx >= 1 && idx <= comp.numLayers) {
        try {
            var indexed = comp.layer(idx);
            if (layerMatches(indexed) || (!hasSignature && isAudioCandidate(indexed))) return indexed;
        } catch (e0) {}
    }

    for (var i = 1; i <= comp.numLayers; i++) {
        try {
            var layer = comp.layer(i);
            if (layerMatches(layer)) return layer;
        } catch (e1) {}
    }

    if (!hasSignature) return _findSelectedAudioLayer(comp);
    return null;
}

function getSelectedAudioLayerInfo() {
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var audioLayer = _findSelectedAudioLayer(comp);
        if (!audioLayer) return "Error: Select an audio layer first.";
        var info = _buildAudioLayerInfo(audioLayer, "selected");

        return _audioInfoToJson(info);
    } catch (e) {
        return "Error: " + e.toString();
    }
}

function getPreferredCaptionAudioLayerInfo() {
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var selected = _findSelectedAudioLayer(comp);
        if (selected) {
            var selectedInfo = _buildAudioLayerInfo(selected, "selected");
            return _audioInfoToJson(selectedInfo);
        }

        var audioLayer = _findPreferredCaptionAudioLayer(comp);
        if (!audioLayer) return "Error: Could not find a usable audio layer in the active comp.";
        var mediaPath = _getAudioLayerMediaPath(audioLayer);
        var sourceType = _isPreferredCaptionAudioPath(mediaPath) ? "detected" : "fallback";
        var info = _buildAudioLayerInfo(audioLayer, sourceType);

        return _audioInfoToJson(info);
    } catch (e) {
        return "Error: " + e.toString();
    }
}

function trimSelectedAudioLayerToRange(startTimeSec, endTimeSec) {
    app.beginUndoGroup("Trim Selected Audio Layer");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var audioLayer = _findSelectedAudioLayer(comp);
        if (!audioLayer) return "Error: Select an audio layer first.";

        var trimStart = parseFloat(startTimeSec);
        var trimEnd = parseFloat(endTimeSec);
        if (isNaN(trimStart) || isNaN(trimEnd)) return "Error: Invalid trim range.";
        if (trimEnd <= trimStart) return "Error: End must be after start.";

        var originalIn = audioLayer.inPoint;
        var maxSourceDur = 0;
        try { maxSourceDur = audioLayer.source && audioLayer.source.duration ? audioLayer.source.duration : 0; } catch (e0) { maxSourceDur = 0; }
        if (maxSourceDur > 0) {
            trimStart = Math.max(0, Math.min(trimStart, maxSourceDur));
            trimEnd = Math.max(trimStart + comp.frameDuration, Math.min(trimEnd, maxSourceDur));
        }

        audioLayer.startTime = originalIn - trimStart;
        audioLayer.inPoint = originalIn;
        audioLayer.outPoint = Math.min(comp.duration, originalIn + (trimEnd - trimStart));

        return "Trimmed selected audio to " + trimStart.toFixed(2) + "s - " + trimEnd.toFixed(2) + "s.";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function _findAudioAmplitudeSlider(comp, recentLayerLimit) {
    function sliderFromLayer(layer) {
        if (!layer) return null;
        var fx = null;
        try { fx = layer.property("ADBE Effect Parade"); } catch (e) { fx = null; }
        if (!fx) return null;

        try {
            var both = fx.property("Both Channels");
            if (!both) return null;
            return both.property("ADBE Slider Control-0001") || null;
        } catch (e2) {
            return null;
        }
    }

    var recentLimit = parseInt(recentLayerLimit, 10);
    if (!isNaN(recentLimit) && recentLimit > 0) {
        var maxRecent = Math.min(comp.numLayers, recentLimit);
        for (var r = 1; r <= maxRecent; r++) {
            try {
                var recentLayer = comp.layer(r);
                var recentName = ("" + (recentLayer.name || "")).toLowerCase();
                if (recentName.indexOf("audio amplitude") !== -1) {
                    var recentSlider = sliderFromLayer(recentLayer);
                    if (recentSlider) return recentSlider;
                }
            } catch (e3) {}
        }
        for (var rr = 1; rr <= maxRecent; rr++) {
            try {
                var anyRecentSlider = sliderFromLayer(comp.layer(rr));
                if (anyRecentSlider) return anyRecentSlider;
            } catch (e4) {}
        }
    }

    var fallback = null;
    for (var i = 1; i <= comp.numLayers; i++) {
        try {
            var lyr = comp.layer(i);
            var name = ("" + (lyr.name || "")).toLowerCase();
            var slider = sliderFromLayer(lyr);
            if (!slider) continue;
            if (name.indexOf("audio amplitude") !== -1) return slider;
            if (!fallback) fallback = slider;
        } catch (e5) {}
    }
    return fallback;
}

function _removeExistingBeatMarkers(markerProp) {
    if (!markerProp || markerProp.numKeys < 1) return;
    var removed = 0;
    for (var i = markerProp.numKeys; i >= 1; i--) {
        try {
            var mv = markerProp.keyValue(i);
            var comment = mv && mv.comment ? ("" + mv.comment).toLowerCase() : "";
            if (comment.indexOf("beat") === 0 || /^\d+$/.test(comment) || comment === "loop") {
                markerProp.removeKey(i);
                removed++;
            }
        } catch (e) {}
    }
    return removed;
}

function _markerLabelIndexFromName(name) {
    var key = ("" + (name || "cyan")).toLowerCase();
    if (key === "white" || key === "default" || key === "none") return 0;
    if (key === "red") return 1;
    if (key === "yellow") return 2;
    if (key === "aqua") return 3;
    if (key === "pink") return 4;
    if (key === "lavender") return 5;
    if (key === "peach") return 6;
    if (key === "sea foam") return 7;
    if (key === "blue") return 8;
    if (key === "green") return 9;
    if (key === "purple") return 10;
    if (key === "orange") return 11;
    if (key === "brown") return 12;
    if (key === "magenta" || key === "fuchsia") return 13;
    if (key === "cyan") return 14;
    if (key === "sandstone") return 15;
    if (key === "dark green") return 16;
    return 14;
}

function _tryExecuteFirstMenuCommand(commandNames) {
    if (!commandNames || !commandNames.length) return false;
    for (var i = 0; i < commandNames.length; i++) {
        var cmdId = 0;
        try { cmdId = app.findMenuCommandId(commandNames[i]); } catch (eFind) { cmdId = 0; }
        if (cmdId > 0) {
            try {
                app.executeCommand(cmdId);
                return true;
            } catch (eExec) {}
        }
    }
    return false;
}

function _activateCompViewer(comp) {
    if (!comp) return false;
    var activated = false;
    try {
        var viewer = comp.openInViewer();
        if (viewer) {
            try {
                if (typeof viewer.setActive === "function") {
                    viewer.setActive();
                    activated = true;
                }
            } catch (eSetActive) {}
        }
    } catch (eOpen) {}

    if (!activated) {
        try {
            if (app.activeViewer && typeof app.activeViewer.setActive === "function") {
                app.activeViewer.setActive();
                activated = true;
            }
        } catch (eActive) {}
    }
    return activated;
}

function _activateTimelinePanel(comp) {
    if (!comp) return false;
    _activateCompViewer(comp);

    var activated = false;
    activated = _tryExecuteFirstMenuCommand([
        "Timeline",
        "Timeline Panel",
        "Activate Timeline Panel",
        "Composition"
    ]) || activated;

    try {
        if (app.activeViewer && typeof app.activeViewer.setActive === "function") {
            app.activeViewer.setActive();
            activated = true;
        }
    } catch (eActiveTimeline) {}

    return activated;
}

function _isBeatMarkerComment(comment) {
    var text = ("" + (comment || "")).toLowerCase();
    return text.indexOf("beat") === 0 || /^\d+$/.test(text) || text === "loop";
}

function _serializeBeatMarkerEntries(entries) {
    if (!entries || !entries.length) return "";
    var parts = [];
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry || !isFinite(entry.t)) continue;
        parts.push(Number(entry.t).toFixed(5) + "," + (entry.isLoop ? "1" : "0"));
    }
    return parts.join("|");
}

function _parseBeatMarkerEntries(serialized) {
    var out = [];
    var text = "" + (serialized || "");
    if (!text) return out;
    var parts = text.split("|");
    for (var i = 0; i < parts.length; i++) {
        var pair = parts[i].split(",");
        if (pair.length < 1) continue;
        var t = parseFloat(pair[0]);
        if (!isFinite(t)) continue;
        out.push({ t: t, isLoop: pair.length > 1 && pair[1] === "1" });
    }
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
}

function getBeatMarkersInRange(createCompMarkers, startTimeSec, endTimeSec, preferredLayerIndex, preferredMediaPath, preferredLayerName) {
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var useCompMarkers = (createCompMarkers === true || createCompMarkers === "true");
        var audioLayer = null;
        if (!useCompMarkers) {
            audioLayer = _resolveBeatAudioLayer(comp, preferredLayerIndex, preferredMediaPath, preferredLayerName);
            if (!audioLayer) {
                if (preferredLayerIndex || preferredMediaPath || preferredLayerName) {
                    return "Error: Synced audio layer no longer matches the comp. Re-sync timeline audio.";
                }
                return "Error: Select an audio layer first.";
            }
        }

        var startAt = parseFloat(startTimeSec);
        if (isNaN(startAt)) startAt = comp.displayStartTime;
        var endAt = parseFloat(endTimeSec);
        if (isNaN(endAt)) endAt = comp.displayStartTime + comp.duration;
        if (!(endAt >= startAt)) endAt = startAt;

        var targetMarkerProp = useCompMarkers ? comp.markerProperty : audioLayer.property("ADBE Marker");
        if (!targetMarkerProp) return "Error: Marker property unavailable on target.";

        var entries = [];
        var count = 0;
        try { count = targetMarkerProp.numKeys || 0; } catch (eC) { count = 0; }
        for (var i = 1; i <= count; i++) {
            try {
                var t = targetMarkerProp.keyTime(i);
                if (t < startAt || t > endAt) continue;
                var mv = targetMarkerProp.keyValue(i);
                var comment = mv && mv.comment ? ("" + mv.comment) : "";
                if (!_isBeatMarkerComment(comment)) continue;
                entries.push({
                    t: t,
                    isLoop: ("" + comment).toLowerCase() === "loop"
                });
            } catch (eRead) {}
        }
        return _serializeBeatMarkerEntries(entries);
    } catch (e) {
        return "Error: " + e.toString();
    }
}

function applyManualBeatMarkers(markerColorName, createCompMarkers, startTimeSec, endTimeSec, serializedMarkers, preferredLayerIndex, preferredMediaPath, preferredLayerName) {
    app.beginUndoGroup("Apply Manual Beat Markers");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var useCompMarkers = (createCompMarkers === true || createCompMarkers === "true");
        var audioLayer = null;
        if (!useCompMarkers) {
            audioLayer = _resolveBeatAudioLayer(comp, preferredLayerIndex, preferredMediaPath, preferredLayerName);
            if (!audioLayer) {
                if (preferredLayerIndex || preferredMediaPath || preferredLayerName) {
                    return "Error: Synced audio layer no longer matches the comp. Re-sync timeline audio.";
                }
                return "Error: Select an audio layer first.";
            }
        }

        var startAt = parseFloat(startTimeSec);
        if (isNaN(startAt)) startAt = comp.displayStartTime;
        var endAt = parseFloat(endTimeSec);
        if (isNaN(endAt)) endAt = comp.displayStartTime + comp.duration;
        if (!(endAt >= startAt)) endAt = startAt;

        var targetMarkerProp = useCompMarkers ? comp.markerProperty : audioLayer.property("ADBE Marker");
        if (!targetMarkerProp) return "Error: Marker property unavailable on target.";

        for (var i = targetMarkerProp.numKeys; i >= 1; i--) {
            try {
                var existingTime = targetMarkerProp.keyTime(i);
                if (existingTime < startAt || existingTime > endAt) continue;
                var existingValue = targetMarkerProp.keyValue(i);
                var existingComment = existingValue && existingValue.comment ? ("" + existingValue.comment) : "";
                if (_isBeatMarkerComment(existingComment)) {
                    targetMarkerProp.removeKey(i);
                }
            } catch (eRemove) {}
        }

        var entries = _parseBeatMarkerEntries(serializedMarkers);
        var labelIndex = _markerLabelIndexFromName(markerColorName);
        var countAdded = 0;
        for (var j = 0; j < entries.length; j++) {
            var markerTime = entries[j].t;
            if (!isFinite(markerTime) || markerTime < startAt || markerTime > endAt) continue;
            var markerIsLoop = entries[j].isLoop === true;
            var mv = new MarkerValue(markerIsLoop ? "loop" : ("" + (countAdded + 1)));
            mv.comment = markerIsLoop ? "loop" : ("" + (countAdded + 1));
            if (labelIndex > 0) {
                try { mv.label = labelIndex; } catch (eLabel) {}
            }
            targetMarkerProp.setValueAtTime(markerTime, mv);
            countAdded++;
        }

        return "Applied " + countAdded + " manual beat marker(s) on " + (useCompMarkers ? "comp" : "layer") + ".";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function openManualBeatFix(preferredLayerIndex, preferredMediaPath, preferredLayerName) {
    app.beginUndoGroup("Open Manual Beat Fix");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var audioLayer = _resolveBeatAudioLayer(comp, preferredLayerIndex, preferredMediaPath, preferredLayerName);
        if (!audioLayer) {
            if (preferredLayerIndex || preferredMediaPath || preferredLayerName) {
                return "Error: Synced audio layer no longer matches the comp. Re-sync timeline audio.";
            }
            return "Error: Select an audio layer first.";
        }

        var layerCountBeforeAudioKeys = comp.numLayers;
        var amplitudeLayer = null;
        var slider = _findAudioAmplitudeSlider(comp, 0);
        _activateCompViewer(comp);

        if (!slider) {
            var cmdId = 0;
            try { cmdId = app.findMenuCommandId("Convert Audio to Keyframes"); } catch (e0) { cmdId = 0; }
            if (cmdId <= 0) return "Error: Could not access Convert Audio to Keyframes.";

            _deselectAll(comp);
            audioLayer.selected = true;
            app.executeCommand(cmdId);

            var recentlyAddedLayers = Math.max(0, comp.numLayers - layerCountBeforeAudioKeys);
            if (recentlyAddedLayers > 0) {
                var maxRecentLayers = Math.min(comp.numLayers, recentlyAddedLayers);
                for (var ar = 1; ar <= maxRecentLayers; ar++) {
                    try {
                        var candidateAmp = comp.layer(ar);
                        var candidateName = ("" + (candidateAmp.name || "")).toLowerCase();
                        if (candidateName.indexOf("audio amplitude") !== -1) {
                            amplitudeLayer = candidateAmp;
                            break;
                        }
                    } catch (eAmp) {}
                }
            }
            slider = _findAudioAmplitudeSlider(comp, recentlyAddedLayers);
        }

        if (!slider) return "Error: Could not find Audio Amplitude slider.";

        try { amplitudeLayer = _getLayerAncestorFromProp(slider); } catch (eLayer) { amplitudeLayer = null; }
        if (!amplitudeLayer) {
            try {
                for (var i = 1; i <= comp.numLayers; i++) {
                    var maybe = comp.layer(i);
                    var maybeName = ("" + (maybe.name || "")).toLowerCase();
                    if (maybeName.indexOf("audio amplitude") !== -1) {
                        amplitudeLayer = maybe;
                        break;
                    }
                }
            } catch (eFind) {}
        }

        _deselectAll(comp);
        if (amplitudeLayer) {
            amplitudeLayer.selected = true;
            try { comp.selectedLayers = [amplitudeLayer]; } catch (eSel) {}
        }
        try { slider.selected = true; } catch (eSliderSel) {}
        _activateTimelinePanel(comp);
        _activateTimelinePanel(comp);

        _tryExecuteFirstMenuCommand([
            "Show Graph Editor",
            "Show/Hide Graph Editor",
            "Graph Editor",
            "Toggle Graph Editor",
            "Graph Editor Set",
            "Show Graph Editor Set"
        ]);

        return "Opened Audio Amplitude slider and graph editor for manual beat fixing.";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function _findBeatAttackStartTime(slider, peakIndex, floorValue, comp) {
    var peakTime = slider.keyTime(peakIndex);
    var peakValue = slider.keyValue(peakIndex);
    var frameDur = comp && comp.frameDuration ? comp.frameDuration : (1 / 25);
    var targetValue = floorValue + ((peakValue - floorValue) * 0.42);
    var minSearchTime = peakTime - Math.max(frameDur * 8, 0.12);
    var bestTime = peakTime;

    for (var j = peakIndex; j >= 2; j--) {
        var prevT = slider.keyTime(j - 1);
        if (prevT < minSearchTime) break;

        var curT = slider.keyTime(j);
        var prevV = slider.keyValue(j - 1);
        var curV = slider.keyValue(j);

        if (prevV <= targetValue && curV >= targetValue) {
            var denom = curV - prevV;
            if (Math.abs(denom) < 0.0001) return prevT;
            var ratio = (targetValue - prevV) / denom;
            bestTime = prevT + ((curT - prevT) * ratio);
            break;
        }
    }

    return Math.max(minSearchTime, bestTime - Math.min(frameDur * 0.35, 0.008));
}

function _medianNumber(values) {
    if (!values || values.length === 0) return 0;
    var copy = values.slice(0);
    copy.sort(function (a, b) { return a - b; });
    var mid = Math.floor(copy.length / 2);
    if (copy.length % 2 === 0) return (copy[mid - 1] + copy[mid]) * 0.5;
    return copy[mid];
}

function _estimateDominantGap(peaks, comp) {
    if (!peaks || peaks.length < 2) return 0;
    var frameDur = comp && comp.frameDuration ? comp.frameDuration : (1 / 25);
    var gaps = [];
    for (var i = 1; i < peaks.length; i++) {
        var gap = peaks[i].t - peaks[i - 1].t;
        if (gap > frameDur * 4) gaps.push(gap);
    }
    return _medianNumber(gaps);
}

function _windowMinValue(slider, centerIndex, startOffset, endOffset) {
    var minV = null;
    for (var i = centerIndex + startOffset; i <= centerIndex + endOffset; i++) {
        if (i < 1 || i > slider.numKeys) continue;
        var v = slider.keyValue(i);
        if (minV === null || v < minV) minV = v;
    }
    return minV === null ? slider.keyValue(centerIndex) : minV;
}

function _estimateHighPeakFloor(peaks) {
    if (!peaks || peaks.length === 0) return 0;
    var byValue = peaks.slice(0);
    byValue.sort(function (a, b) { return b.v - a.v; });
    var take = Math.max(3, Math.min(byValue.length, Math.ceil(byValue.length * 0.2)));
    var vals = [];
    for (var i = 0; i < take; i++) vals.push(byValue[i].v);
    return _medianNumber(vals);
}

function _refineChosenBeatPeaks(chosen, comp) {
    if (!chosen || chosen.length < 3) return chosen || [];

    var refined = chosen.slice(0);
    var frameDur = comp && comp.frameDuration ? comp.frameDuration : (1 / 25);

    for (var pass = 0; pass < 3; pass++) {
        if (refined.length < 3) break;

        var gaps = [];
        for (var g = 1; g < refined.length; g++) {
            var gap = refined[g].t - refined[g - 1].t;
            if (gap > frameDur * 4) gaps.push(gap);
        }

        var medianGap = _medianNumber(gaps);
        if (medianGap <= frameDur * 8) break;

        var removed = false;
        for (var i = 1; i < refined.length - 1; i++) {
            var prev = refined[i - 1];
            var cur = refined[i];
            var next = refined[i + 1];
            var gapPrev = cur.t - prev.t;
            var gapNext = next.t - cur.t;
            var shortGap = Math.min(gapPrev, gapNext);
            var combinedGap = next.t - prev.t;

            if (shortGap > medianGap * 0.72 && combinedGap > medianGap * 1.35) continue;

            var weakerThanPrev = (cur.score <= prev.score * 0.82) || (cur.v <= prev.v * 0.88);
            var weakerThanNext = (cur.score <= next.score * 0.82) || (cur.v <= next.v * 0.88);

            if (weakerThanPrev && weakerThanNext) {
                refined.splice(i, 1);
                removed = true;
                break;
            }
        }

        if (!removed) break;
    }

    return refined;
}

function _stabilizeBeatSpacing(chosen, comp) {
    if (!chosen || chosen.length < 3) return chosen || [];

    var refined = chosen.slice(0);
    var frameDur = comp && comp.frameDuration ? comp.frameDuration : (1 / 25);
    var dominantGap = _estimateDominantGap(refined, comp);
    if (dominantGap <= frameDur * 8) return refined;

    var dedupeGap = Math.max(frameDur * 5, dominantGap * 0.38);
    for (var i = refined.length - 1; i >= 1; i--) {
        var gap = refined[i].t - refined[i - 1].t;
        if (gap >= dedupeGap) continue;
        var keepLeft = refined[i - 1].score >= refined[i].score;
        refined.splice(keepLeft ? i : (i - 1), 1);
    }

    for (var pass = 0; pass < 2; pass++) {
        if (refined.length < 3) break;
        dominantGap = _estimateDominantGap(refined, comp);
        if (dominantGap <= frameDur * 8) break;

        var changed = false;
        for (var j = 1; j < refined.length - 1; j++) {
            var prev = refined[j - 1];
            var cur = refined[j];
            var next = refined[j + 1];
            var gapPrev = cur.t - prev.t;
            var gapNext = next.t - cur.t;

            var tooEarly = gapPrev < dominantGap * 0.55;
            var tooLate = gapNext < dominantGap * 0.55;
            var weakerThanBoth = cur.score <= prev.score * 0.86 && cur.score <= next.score * 0.86;

            if ((tooEarly || tooLate) && weakerThanBoth) {
                refined.splice(j, 1);
                changed = true;
                break;
            }
        }
        if (!changed) break;
    }

    return refined;
}

function analyzeAndMarkBeats(markerColorName, snapToFrames, createCompMarkers, startTimeSec, endTimeSec, sensitivityMode, preferredLayerIndex, preferredMediaPath, preferredLayerName, createLoopMarker, loopBeatOffset) {
    app.beginUndoGroup("Analyze And Mark Clear Beats");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var audioLayer = _resolveBeatAudioLayer(comp, preferredLayerIndex, preferredMediaPath, preferredLayerName);
        if (!audioLayer) {
            if (preferredLayerIndex || preferredMediaPath || preferredLayerName) {
                return "Error: Synced audio layer no longer matches the comp. Re-sync timeline audio.";
            }
            return "Error: Select an audio layer first.";
        }

        var layerCountBeforeAudioKeys = comp.numLayers;
        var amplitudeLayer = null;
        var cmdId = 0;
        try { cmdId = app.findMenuCommandId("Convert Audio to Keyframes"); } catch (e0) { cmdId = 0; }
        if (cmdId > 0) {
            _deselectAll(comp);
            audioLayer.selected = true;
            app.executeCommand(cmdId);
        }

        var recentlyAddedLayers = Math.max(0, comp.numLayers - layerCountBeforeAudioKeys);
        if (recentlyAddedLayers > 0) {
            var maxRecentLayers = Math.min(comp.numLayers, recentlyAddedLayers);
            for (var ar = 1; ar <= maxRecentLayers; ar++) {
                try {
                    var candidateAmp = comp.layer(ar);
                    var candidateName = ("" + (candidateAmp.name || "")).toLowerCase();
                    if (candidateName.indexOf("audio amplitude") !== -1) {
                        amplitudeLayer = candidateAmp;
                        break;
                    }
                } catch (eAmp) {}
            }
        }
        var slider = _findAudioAmplitudeSlider(comp, recentlyAddedLayers);
        if (!slider || slider.numKeys < 3) {
            if (amplitudeLayer) {
                try { amplitudeLayer.remove(); } catch (eAmpRemove1) {}
            }
            return "Error: Could not read audio amplitude keys.";
        }

        var peaks = [];
        var k;
        var total = 0;
        var validCount = 0;
        var startAt = parseFloat(startTimeSec);
        if (isNaN(startAt)) startAt = comp.displayStartTime;
        startAt = Math.max(comp.displayStartTime, Math.min(startAt, comp.displayStartTime + comp.duration));
        var endAt = parseFloat(endTimeSec);
        if (isNaN(endAt)) endAt = comp.displayStartTime + comp.duration;
        endAt = Math.max(startAt + comp.frameDuration, Math.min(endAt, comp.displayStartTime + comp.duration));

        for (k = 1; k <= slider.numKeys; k++) {
            if (slider.keyTime(k) < startAt || slider.keyTime(k) > endAt) continue;
            total += slider.keyValue(k);
            validCount++;
        }
        if (validCount < 3) return "Error: Not enough audio keys inside the selected range.";
        var mean = total / validCount;

        for (k = 2; k <= slider.numKeys - 1; k++) {
            if (slider.keyTime(k) < startAt || slider.keyTime(k) > endAt) continue;
            var prev = slider.keyValue(k - 1);
            var cur = slider.keyValue(k);
            var next = slider.keyValue(k + 1);
            if (cur >= prev && cur >= next) {
                var leftMin = _windowMinValue(slider, k, -4, -1);
                var rightMin = _windowMinValue(slider, k, 1, 4);
                var localFloor = Math.max(0, Math.min(leftMin, rightMin, mean));
                var attackScore = cur - leftMin;
                var releaseScore = cur - rightMin;
                peaks.push({
                    peakT: slider.keyTime(k),
                    t: _findBeatAttackStartTime(slider, k, localFloor, comp),
                    v: cur,
                    score: (attackScore * 0.8) + (releaseScore * 0.35)
                });
            }
        }

        if (peaks.length === 0) return "Error: No beat peaks found.";

        peaks.sort(function (a, b) { return b.score - a.score; });

        var mode = ("" + (sensitivityMode || "balanced")).toLowerCase();
        var isMainOnly = (mode === "main" || mode === "mainonly" || mode === "main-only");
        var isUltra = (mode === "all" || mode === "ultra" || mode === "most");
        var isMoreSensitive = (mode === "more" || mode === "dense" || isUltra);

        var maxBeats = Math.max(6, Math.round(comp.duration * (isMainOnly ? 1.2 : (isUltra ? 3.5 : (isMoreSensitive ? 3.0 : 2.2)))));
        var chosen = [];
        var minGap = Math.max(
            comp.frameDuration * (isMainOnly ? 12 : (isUltra ? 4 : (isMoreSensitive ? 5 : 7))),
            isMainOnly ? 0.3 : (isUltra ? 0.1 : (isMoreSensitive ? 0.12 : 0.18))
        );
        var strongest = peaks[0];
        var maxV = strongest ? strongest.v : mean;
        var minPeakValue = mean + ((maxV - mean) * (isUltra ? 0.12 : 0.18));
        var minScore = Math.max(0.6, (strongest ? strongest.score : 1) * (isUltra ? 0.12 : 0.18));
        var highPeakFloor = _estimateHighPeakFloor(peaks);
        var dominantGapSeed = _estimateDominantGap(peaks, comp);
        var stricterForSteadyRhythm = dominantGapSeed > Math.max(comp.frameDuration * 10, 0.28);
        if (highPeakFloor > 0) {
            var floorFactor = isMainOnly
                ? (stricterForSteadyRhythm ? 0.9 : 0.84)
                : (isUltra ? 0.5 : (isMoreSensitive ? 0.6 : (stricterForSteadyRhythm ? 0.78 : 0.68)));
            minPeakValue = Math.max(minPeakValue, highPeakFloor * floorFactor);
        }
        if (stricterForSteadyRhythm) {
            minScore = Math.max(minScore, (strongest ? strongest.score : minScore) * (isMainOnly ? 0.46 : (isUltra ? 0.12 : (isMoreSensitive ? 0.18 : 0.28))));
        }
        if (isMainOnly) {
            minScore = Math.max(minScore, (strongest ? strongest.score : minScore) * 0.36);
        }

        for (k = 0; k < peaks.length && chosen.length < maxBeats; k++) {
            if (peaks[k].peakT < startAt || peaks[k].peakT > endAt) continue;
            if (peaks[k].score < minScore) continue;
            if (peaks[k].v < minPeakValue && peaks[k].score < (minScore * 1.35)) continue;
            var ok = true;
            for (var c = 0; c < chosen.length; c++) {
                if (Math.abs(chosen[c].t - peaks[k].t) < minGap) {
                    ok = false;
                    break;
                }
            }
            if (ok) chosen.push(peaks[k]);
        }

        chosen.sort(function (a, b) { return a.t - b.t; });
        chosen = _refineChosenBeatPeaks(chosen, comp);
        chosen = _stabilizeBeatSpacing(chosen, comp);

        var shouldCreateLoop = (createLoopMarker === true || createLoopMarker === "true");
        var loopIndex = -1;
        if (shouldCreateLoop && chosen.length > 0) {
            var candidateLoopIndex = Math.floor((chosen.length - 1) / 2);
            var requestedLoopOffset = parseInt(loopBeatOffset, 10);
            if (isNaN(requestedLoopOffset)) requestedLoopOffset = 0;
            loopIndex = Math.max(0, Math.min(chosen.length - 1, candidateLoopIndex + requestedLoopOffset));
            chosen = chosen.slice(0, loopIndex + 1);
        }

        var useCompMarkers = (createCompMarkers === true || createCompMarkers === "true");
        var doSnap = (snapToFrames === true || snapToFrames === "true");
        var labelIndex = _markerLabelIndexFromName(markerColorName);
        var targetMarkerProp = useCompMarkers ? comp.markerProperty : audioLayer.property("ADBE Marker");
        if (!targetMarkerProp) return "Error: Marker property unavailable on target.";
        _removeExistingBeatMarkers(targetMarkerProp);

        for (k = 0; k < chosen.length; k++) {
            var t = chosen[k].t;
            if (t < startAt || t > endAt) continue;
            if (doSnap) {
                t = comp.displayStartTime + Math.round((t - comp.displayStartTime) / comp.frameDuration) * comp.frameDuration;
            }
            var isLoopMarker = (shouldCreateLoop && loopIndex >= 0 && k === chosen.length - 1);
            var mv = new MarkerValue(isLoopMarker ? "loop" : ("" + (k + 1)));
            mv.comment = isLoopMarker ? "loop" : ("" + (k + 1));
            if (labelIndex > 0) {
                try { mv.label = labelIndex; } catch (eSet) {}
            }
            targetMarkerProp.setValueAtTime(t, mv);
        }

        if (amplitudeLayer) {
            try { amplitudeLayer.remove(); } catch (eAmpRemove2) {}
        }

        if (shouldCreateLoop && loopIndex >= 0 && chosen.length > 0) {
            return "Marked " + chosen.length + " beat marker(s) with loop on " + (useCompMarkers ? "comp" : "layer") + ".";
        }
        return "Marked " + chosen.length + " beat marker(s) on " + (useCompMarkers ? "comp" : "layer") + ".";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function analyzeAndMarkBeatsClear() {
    return analyzeAndMarkBeats("cyan", true, true, 0, null, "balanced");
}

function clearBeatMarkers(createCompMarkers, preferredLayerIndex, preferredMediaPath, preferredLayerName) {
    app.beginUndoGroup("Clear Beat Markers");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var useCompMarkers = (createCompMarkers === true || createCompMarkers === "true");
        var audioLayer = null;
        if (!useCompMarkers) {
            audioLayer = _resolveBeatAudioLayer(comp, preferredLayerIndex, preferredMediaPath, preferredLayerName);
            if (!audioLayer) {
                if (preferredLayerIndex || preferredMediaPath || preferredLayerName) {
                    return "Error: Synced audio layer no longer matches the comp. Re-sync timeline audio.";
                }
                return "Error: Select an audio layer first.";
            }
        }

        var targetMarkerProp = useCompMarkers ? comp.markerProperty : audioLayer.property("ADBE Marker");
        if (!targetMarkerProp) return "Error: Marker property unavailable on target.";

        var removed = _removeExistingBeatMarkers(targetMarkerProp) || 0;
        return "Cleared " + removed + " beat marker(s) from " + (useCompMarkers ? "comp" : "layer") + ".";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function _set2(prop, t1, v1, t2, v2) {
    if (!prop) return;
    prop.setValueAtTime(t1, v1);
    prop.setValueAtTime(t2, v2);
}

function applyTextAnimationToSelectedLayers(animId, durationMs, staggerMs, trackingAmount, startOffsetMs) {
    app.beginUndoGroup("Apply Text Animation");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var sel = _getSelectedLayers(comp);
        if (!sel || sel.length === 0) return "Error: Select one or more text layers.";

        var textLayers = [];
        for (var i = 0; i < sel.length; i++) {
            try {
                if (sel[i].property("ADBE Text Properties")) textLayers.push(sel[i]);
            } catch (e0) {}
        }
        if (textLayers.length === 0) return "Error: No text layers selected.";

        var dur = _clamp(_aeSafeInt(durationMs, 600), 50, 6000) / 1000.0;
        var stagger = _clamp(_aeSafeInt(staggerMs, 40), 0, 1000) / 1000.0;
        var tracking = _clamp(_aeSafeFloat(trackingAmount, 0.5), 0.1, 3.0);
        var startOffset = _clamp(_aeSafeInt(startOffsetMs, 0), 0, 120000) / 1000.0;

        var applied = 0;
        for (var l = 0; l < textLayers.length; l++) {
            var layer = textLayers[l];
            var t0 = comp.time + startOffset + (l * stagger);
            var t1 = t0 + dur;
            var tm = t0 + dur * 0.6;

            var tr = layer.property("ADBE Transform Group");
            var op = tr.property("ADBE Opacity");
            var pos = tr.property("ADBE Position");
            var scl = tr.property("ADBE Scale");

            var posNow = pos.value;
            var sclNow = scl.value;

            var id = (animId || "").toLowerCase();
            if (id === "fade-out" || id === "smooth-fade-out") {
                _set2(op, t0, 100, t1, 0);
            } else if (id === "fade-up") {
                _set2(op, t0, 0, t1, 100);
                _set2(pos, t0, [posNow[0], posNow[1] + 60], t1, [posNow[0], posNow[1]]);
            } else if (id === "fade-down") {
                _set2(op, t0, 0, t1, 100);
                _set2(pos, t0, [posNow[0], posNow[1] - 60], t1, [posNow[0], posNow[1]]);
            } else if (id === "scale-pop" || id === "bounce-in") {
                op.setValueAtTime(t0, 0);
                op.setValueAtTime(t1, 100);
                scl.setValueAtTime(t0, [80, 80]);
                scl.setValueAtTime(tm, [110, 110]);
                scl.setValueAtTime(t1, [sclNow[0], sclNow[1]]);
            } else if (id === "tracking-in") {
                _set2(op, t0, 0, t1, 100);
                _set2(scl, t0, [100 - (tracking * 20), 100], t1, [100, 100]);
            } else if (id === "tracking-out") {
                _set2(op, t0, 100, t1, 0);
                _set2(scl, t0, [100, 100], t1, [100 - (tracking * 20), 100]);
            } else {
                _set2(op, t0, 0, t1, 100);
            }

            applied++;
        }

        return "Applied text animation to " + applied + " layer(s).";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function inspectTextAnimationState() {
    try {
        var comp = _aeActiveComp();
        if (!comp) return "[]";

        var sel = _getSelectedLayers(comp);
        var out = [];

        for (var i = 0; i < sel.length; i++) {
            var l = sel[i];
            try {
                if (!l.property("ADBE Text Properties")) continue;

                var tr = l.property("ADBE Transform Group");
                var op = tr.property("ADBE Opacity");
                var pos = tr.property("ADBE Position");
                var scl = tr.property("ADBE Scale");

                var keys = (op ? op.numKeys : 0) + (pos ? pos.numKeys : 0) + (scl ? scl.numKeys : 0);
                out.push({ name: l.name, animated: keys > 0, keys: keys });
            } catch (e0) {}
        }

        if (typeof JSON !== "undefined" && JSON.stringify) return JSON.stringify(out);
        return "[]";
    } catch (e) {
        return "Error: " + e.toString();
    }
}

function _clearPropertyKeys(prop, compTime) {
    if (!prop) return;
    var valueNow = null;
    try { valueNow = prop.valueAtTime(compTime, false); } catch (e0) {}

    for (var i = prop.numKeys; i >= 1; i--) {
        try { prop.removeKey(i); } catch (e1) {}
    }

    try {
        if (valueNow !== null) prop.setValue(valueNow);
    } catch (e2) {}
}

function removeTextAnimationFromSelectedLayers() {
    app.beginUndoGroup("Remove Text Animations");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var sel = _getSelectedLayers(comp);
        if (!sel || sel.length === 0) return "Error: Select text layer(s) first.";

        var affected = 0;
        for (var i = 0; i < sel.length; i++) {
            var l = sel[i];
            try {
                if (!l.property("ADBE Text Properties")) continue;

                var tr = l.property("ADBE Transform Group");
                _clearPropertyKeys(tr.property("ADBE Opacity"), comp.time);
                _clearPropertyKeys(tr.property("ADBE Position"), comp.time);
                _clearPropertyKeys(tr.property("ADBE Scale"), comp.time);
                affected++;
            } catch (e0) {}
        }

        return "Removed animation keys from " + affected + " text layer(s).";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}

function _makeEaseArray(dim, speed, influence) {
    var arr = [];
    for (var i = 0; i < dim; i++) {
        arr.push(new KeyframeEase(speed, influence));
    }
    return arr;
}

function _valueDistance(a, b) {
    try {
        if (a instanceof Array && b instanceof Array) {
            var len = Math.min(a.length, b.length);
            var sum = 0;
            for (var i = 0; i < len; i++) {
                var d = (a[i] - b[i]);
                sum += d * d;
            }
            return Math.sqrt(sum);
        }
        return Math.abs((a - b));
    } catch (e) {
        return 1;
    }
}

function applyEasingToSelectedKeyframes(cp1x, cp1y, cp2x, cp2y) {
    app.beginUndoGroup("Apply Easing To Keyframes");
    try {
        var comp = _aeActiveComp();
        if (!comp) return "Error: No active composition.";

        var props = comp.selectedProperties;
        if (!props || props.length === 0) return "Error: Select one or more animated properties.";

        var x1 = _clamp(_aeSafeFloat(cp1x, 0.25), 0.0001, 0.9999);
        var y1 = _aeSafeFloat(cp1y, 0.1);
        var x2 = _clamp(_aeSafeFloat(cp2x, 0.75), 0.0001, 0.9999);
        var y2 = _aeSafeFloat(cp2y, 1.0);

        var outInfluence = _clamp(x1 * 100, 1, 100);
        var inInfluence = _clamp((1 - x2) * 100, 1, 100);

        var outSlope = Math.abs(y1 / x1);
        var inSlope = Math.abs((1 - y2) / (1 - x2));

        var affected = 0;

        for (var p = 0; p < props.length; p++) {
            var prop = props[p];
            if (!prop || prop.numKeys < 1) continue;

            var keys = (prop.selectedKeys && prop.selectedKeys.length > 0) ? prop.selectedKeys : null;
            if (!keys) {
                keys = [];
                for (var kk = 1; kk <= prop.numKeys; kk++) keys.push(kk);
            }

            for (var k = 0; k < keys.length; k++) {
                var keyIndex = keys[k];
                var dim = 1;
                try {
                    var kv = prop.keyValue(keyIndex);
                    if (kv instanceof Array) dim = kv.length;
                } catch (e0) { dim = 1; }
                var keyTime = prop.keyTime(keyIndex);
                var keyValue = prop.keyValue(keyIndex);

                var outBaseSpeed = 1.0;
                if (keyIndex < prop.numKeys) {
                    var nTime = prop.keyTime(keyIndex + 1);
                    var nValue = prop.keyValue(keyIndex + 1);
                    outBaseSpeed = _valueDistance(nValue, keyValue) / Math.max(nTime - keyTime, comp.frameDuration);
                }

                var inBaseSpeed = 1.0;
                if (keyIndex > 1) {
                    var pTime = prop.keyTime(keyIndex - 1);
                    var pValue = prop.keyValue(keyIndex - 1);
                    inBaseSpeed = _valueDistance(keyValue, pValue) / Math.max(keyTime - pTime, comp.frameDuration);
                }

                var outSpeed = _clamp(outBaseSpeed * outSlope, 0.01, 10000);
                var inSpeed = _clamp(inBaseSpeed * inSlope, 0.01, 10000);

                var inEase = _makeEaseArray(dim, inSpeed, inInfluence);
                var outEase = _makeEaseArray(dim, outSpeed, outInfluence);

                try {
                    prop.setInterpolationTypeAtKey(keyIndex, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
                    prop.setTemporalEaseAtKey(keyIndex, inEase, outEase);
                    prop.setTemporalContinuousAtKey(keyIndex, false);
                    prop.setTemporalAutoBezierAtKey(keyIndex, false);
                    affected++;
                } catch (e1) {}
            }
        }

        if (affected === 0) return "Error: No editable keyframes found.";
        return "Applied easing to " + affected + " keyframe(s).";
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
}












// Runs AE's own Edit > Split Layer (Ctrl+Shift+D) on the selected layers.
// With removeLeft, the piece before the playhead is then deleted (used by "Remove Left",
// because setting inPoint from script is unreliable in the user's AE).
// Returns a result string, or "" if the command did not take effect so the caller can fall back.
function _leoNativeSplitLayer(comp, layers, t, halfFrame, removeLeft) {
    var targets = [];
    var locked = 0;
    for (var i = 0; i < layers.length; i++) {
        if (layers[i].locked) { locked++; continue; }
        if (t > layers[i].inPoint + halfFrame && t < layers[i].outPoint - halfFrame) targets.push(layers[i]);
    }
    if (targets.length === 0) {
        if (locked > 0) return "Error: The selected layers are locked.";
        return "Error: Move the playhead inside the selected layer first.";
    }

    var cmdId = 0;
    try { cmdId = app.findMenuCommandId("Split Layer"); } catch (eFind) { cmdId = 0; }
    if (!cmdId) cmdId = 2158; // Split Layer, for non-English AE where the name lookup fails

    // Tag targets through their comment so both pieces can be found after the split
    // (the split copies the comment onto the new piece). Original comments are restored below.
    var tagPrefix = "__leoSplit_";
    var tagPattern = /^__leoSplit_(\d+)$/;
    var savedComments = [];
    var before = comp.numLayers;
    var added = 0;
    var removed = 0;

    app.beginUndoGroup(removeLeft ? "Remove Left Of Playhead" : "Split Layer At Playhead");
    try {
        for (var j = 0; j < targets.length; j++) {
            savedComments.push(targets[j].comment);
            targets[j].comment = tagPrefix + j;
        }

        try {
            _activateCompViewer(comp);
            app.executeCommand(cmdId);
        } catch (eExec) {}
        added = comp.numLayers - before;

        var leftParts = [];
        for (var k = 1; k <= comp.numLayers; k++) {
            var lyr = comp.layer(k);
            var m = tagPattern.exec(lyr.comment);
            if (!m) continue;
            lyr.comment = savedComments[parseInt(m[1], 10)];
            if (removeLeft && added > 0 && Math.abs(lyr.outPoint - t) < halfFrame && lyr.inPoint < t - halfFrame) {
                leftParts.push(lyr);
            }
        }
        // Collected top-down, so delete bottom-up: removing a layer never shifts one still to delete.
        for (var r = leftParts.length - 1; r >= 0; r--) {
            leftParts[r].remove();
            removed++;
        }
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }

    if (added <= 0) return "";
    var count = removeLeft ? removed : added;
    var skipped = layers.length - count;
    return (removeLeft ? "Removed left part of " : "Split ") + count + " layer" + (count > 1 ? "s" : "") +
        (skipped > 0 ? " (" + skipped + " skipped)" : "") + ".";
}

// Shrinks the comp to the span of its clips: shifts everything so the earliest clip starts
// at 0:00 and ends the comp at the latest clip end. Uses the selected layers if any, else all.
function _leoFitCompToClips(comp) {
    if (comp.numLayers === 0) return "Error: The composition has no layers.";

    var sel = _getSelectedLayers(comp);
    var useSelection = sel && sel.length > 0;
    var layers = [];
    if (useSelection) {
        for (var i = 0; i < sel.length; i++) layers.push(sel[i]);
    } else {
        for (var j = 1; j <= comp.numLayers; j++) layers.push(comp.layer(j));
    }

    var minIn = null;
    var maxOut = null;
    for (var k = 0; k < layers.length; k++) {
        var a = Math.min(layers[k].inPoint, layers[k].outPoint);
        var b = Math.max(layers[k].inPoint, layers[k].outPoint);
        if (minIn === null || a < minIn) minIn = a;
        if (maxOut === null || b > maxOut) maxOut = b;
    }

    var frame = comp.frameDuration;
    var shift = minIn; // amount to move everything left
    var newDuration = Math.max(frame, Math.round((maxOut - minIn) / frame) * frame);
    if (Math.abs(shift) < frame / 2 && Math.abs(newDuration - comp.duration) < frame / 2) {
        return "Comp already fits the clips.";
    }

    app.beginUndoGroup("Fit Comp To Clips");
    try {
        if (Math.abs(shift) >= frame / 2) {
            // Move every layer (not just the selection) so the timeline stays in sync.
            for (var n = 1; n <= comp.numLayers; n++) {
                var lyr = comp.layer(n);
                var wasLocked = lyr.locked;
                if (wasLocked) lyr.locked = false;
                lyr.startTime -= shift;
                if (wasLocked) lyr.locked = true;
            }

            // Shift comp markers (beat markers etc.) by the same amount.
            try {
                var markers = comp.markerProperty;
                if (markers && markers.numKeys > 0) {
                    var saved = [];
                    for (var mk = 1; mk <= markers.numKeys; mk++) {
                        saved.push({ time: markers.keyTime(mk), value: markers.keyValue(mk) });
                    }
                    for (var rm = markers.numKeys; rm >= 1; rm--) markers.removeKey(rm);
                    for (var s = 0; s < saved.length; s++) {
                        var newTime = saved[s].time - shift;
                        if (newTime >= 0) markers.setValueAtTime(newTime, saved[s].value);
                    }
                }
            } catch (eMarkers) {}
        }

        comp.duration = newDuration;
        comp.workAreaStart = 0;
        comp.workAreaDuration = newDuration;
        if (comp.time > newDuration) comp.time = 0;
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }

    return "Comp fitted to " + (useSelection ? "selected clips" : "clips") + ": " +
        (Math.round(newDuration * 100) / 100) + "s.";
}

// Quick Shortcuts tab: edits the selected layers at the current playhead.
// action: "moveToCompStart" | "moveToPlayhead" | "split" | "trimLeft" | "trimRight"
function leoQuickEdit(action) {
    var undoNames = {
        moveToCompStart: "Move Layer To Comp Start",
        moveToPlayhead: "Move Layer To Playhead",
        split: "Split Layer At Playhead",
        trimLeft: "Remove Left Of Playhead",
        trimRight: "Remove Right Of Playhead",
        fitCompToClips: "Fit Comp To Clips"
    };
    if (!undoNames.hasOwnProperty(action)) return "Error: Unknown shortcut " + action;

    var comp = _aeActiveComp();
    if (!comp) return "Error: Open a composition first.";

    if (action === "fitCompToClips") return _leoFitCompToClips(comp);

    var sel = _getSelectedLayers(comp);
    if (!sel || sel.length === 0) return "Error: Select at least one layer.";

    var layers = [];
    for (var i = 0; i < sel.length; i++) layers.push(sel[i]);
    // Bottom-most first, so a split (duplicate) never shifts the index of a layer still to process.
    layers.sort(function (a, b) { return b.index - a.index; });

    var t = comp.time;
    var halfFrame = comp.frameDuration / 2;

    if (action === "split" || action === "trimLeft") {
        var nativeSplit = _leoNativeSplitLayer(comp, layers, t, halfFrame, action === "trimLeft");
        if (nativeSplit) return nativeSplit;
        // Native command did not run (e.g. AE ignored it while the panel had focus): fall back below.
    }

    var done = 0;
    var locked = 0;
    var outside = 0;
    var splitParts = [];

    app.beginUndoGroup(undoNames[action]);
    try {
        for (var j = 0; j < layers.length; j++) {
            var layer = layers[j];
            if (layer.locked) { locked++; continue; }

            if (action === "moveToCompStart") {
                layer.startTime -= layer.inPoint;
                done++;
                continue;
            }

            if (action === "moveToPlayhead") {
                layer.startTime += t - layer.inPoint;
                done++;
                continue;
            }

            if (t <= layer.inPoint + halfFrame || t >= layer.outPoint - halfFrame) {
                outside++;
                continue;
            }

            if (action === "split") {
                // duplicate() inserts the copy at this index and pushes the original down,
                // and the old `layer` reference can end up pointing at the copy. Re-fetch
                // both pieces by index so each trim hits the right layer.
                var splitIndex = layer.index;
                layer.duplicate();
                var rightPart = comp.layer(splitIndex);
                var leftPart = comp.layer(splitIndex + 1);
                leftPart.outPoint = t;
                rightPart.inPoint = t;
                if (Math.abs(leftPart.outPoint - t) > halfFrame || Math.abs(rightPart.inPoint - t) > halfFrame) {
                    return "Error: Split did not apply cleanly to " + leftPart.name + ". Press Ctrl+Z and try again.";
                }
                splitParts.push(rightPart);
            } else if (action === "trimLeft") {
                layer.inPoint = t;
            } else {
                layer.outPoint = t;
            }
            done++;
        }

        if (splitParts.length > 0) {
            _deselectAll(comp);
            for (var k = 0; k < splitParts.length; k++) splitParts[k].selected = true;
        }
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }

    var notes = [];
    if (outside > 0) notes.push(outside + " skipped, playhead not inside the layer");
    if (locked > 0) notes.push(locked + " locked");
    var suffix = notes.length ? " (" + notes.join(", ") + ")" : "";

    if (done === 0) {
        if (outside > 0 && locked === 0) return "Error: Move the playhead inside the selected layer first.";
        return "Error: No layers changed" + suffix + ".";
    }

    var verbs = {
        moveToCompStart: "Moved to comp start: ",
        moveToPlayhead: "Moved ",
        split: "Split ",
        trimLeft: "Removed left part of ",
        trimRight: "Removed right part of "
    };
    return verbs[action] + done + " layer" + (done > 1 ? "s" : "") + suffix + ".";
}


// ---- Generate Captions: export the active comp's audio to a temp WAV for offline transcription ----

function _leoCompHasAudio(comp) {
    for (var i = 1; i <= comp.numLayers; i++) {
        try {
            var l = comp.layer(i);
            if ((l instanceof AVLayer) && l.hasAudio && l.audioEnabled) return true;
        } catch (e) {}
    }
    return false;
}

// Point an output module at an audio-only WAV. Returns true when the format is confirmed as WAV.
function _leoSetWavOutput(om, sampleRate, stereo) {
    try { om.setSettings({ "Format": "WAV" }); } catch (eFormat) {}
    try { om.setSettings({ "Output Audio": "On" }); } catch (eAudio) {}
    try { om.setSettings({ "Audio Sample Rate": sampleRate || 16000 }); } catch (eRate) {}
    try { om.setSettings({ "Audio Channels": stereo ? "Stereo" : "Mono" }); } catch (eCh) {}
    try { om.setSettings({ "Audio Bit Depth": "16 Bit" }); } catch (eBits) {}

    var format = "";
    try { format = String(om.getSettings(GetSettingsFormat.STRING)["Format"] || ""); } catch (eRead) {}
    if (/wav/i.test(format)) return true;

    // Fallback: an output module template with WAV in its name.
    try {
        var templates = om.templates;
        for (var i = 0; i < templates.length; i++) {
            if (/wav/i.test(templates[i])) {
                om.applyTemplate(templates[i]);
                return true;
            }
        }
    } catch (eTpl) {}
    return false;
}

// Renders the active comp's audio (comp time 0 -> end) to %TEMP%\<prefix> - <comp> <time>.wav.
// Defaults (no arguments) = captions: 16 kHz mono, whole comp, prefix "LEO Comp Audio".
// useSelection: if audible layers are selected, only they are heard (temporarily soloed).
// Returns JSON { path, name, duration, projectDir, compName, sourceLayers } or "Error: ...".
function leoRenderCompAudio(sampleRate, stereo, useSelection, filePrefix) {
    var comp = _aeActiveComp();
    if (!comp) return "Error: Open the composition you want to use first.";
    if (!_leoCompHasAudio(comp)) return "Error: This composition has no audible layers. Turn on audio for your video or add an audio layer.";

    var rq = app.project.renderQueue;
    try {
        if (rq.rendering) return "Error: The Render Queue is busy. Wait for it to finish and try again.";
    } catch (eBusy) {}

    var safeName = String(comp.name).replace(/[\\\/:*?"<>|]/g, "_");
    // Unique per run: the panel keys a caption batch (group id, applied count) by file name,
    // so reusing one name made a new Generate continue the previous batch.
    var now = new Date();
    var stamp = ("0" + now.getHours()).slice(-2) + ("0" + now.getMinutes()).slice(-2) + ("0" + now.getSeconds()).slice(-2);
    var outFile = new File(Folder.temp.fsName + "/" + (filePrefix || "LEO Comp Audio") + " - " + safeName + " " + stamp + ".wav");

    // Render respects solo switches. So for the render: solo exactly the selected audible layers
    // (useSelection), or clear every solo (whole comp). All solo switches are restored afterwards.
    var sourceLayers = [];
    var soloBackup = [];
    var selAudio = [];
    if (useSelection) {
        var sel = _getSelectedLayers(comp);
        for (var si = 0; si < sel.length; si++) {
            try { if ((sel[si] instanceof AVLayer) && sel[si].hasAudio) selAudio.push(sel[si]); } catch (eSel) {}
        }
    }
    var soloTarget = {};
    for (var sa = 0; sa < selAudio.length; sa++) {
        soloTarget[selAudio[sa].index] = true;
        sourceLayers.push(selAudio[sa].index);
    }
    for (var li = 1; li <= comp.numLayers; li++) {
        try {
            var sl = comp.layer(li);
            var wantSolo = !!soloTarget[li];
            if (sl.solo !== wantSolo) {
                soloBackup.push({ layer: sl, solo: sl.solo });
                sl.solo = wantSolo;
            }
        } catch (eSoloSet) {}
    }
    try { if (outFile.exists) outFile.remove(); } catch (eOld) {}

    // Only our item may render: pause anything else that is queued, restore afterwards.
    var paused = [];
    for (var i = 1; i <= rq.numItems; i++) {
        try {
            var it = rq.item(i);
            if (it.status === RQItemStatus.QUEUED) { it.render = false; paused.push(it); }
        } catch (ePause) {}
    }

    var item = null;
    var error = "";
    app.beginSuppressDialogs();
    try {
        item = rq.items.add(comp);
        item.timeSpanStart = 0;
        item.timeSpanDuration = comp.duration;
        var om = item.outputModule(1);
        if (!_leoSetWavOutput(om, sampleRate, stereo)) {
            error = "Error: Could not set a WAV audio output in the Render Queue.";
        } else {
            om.file = outFile;
            rq.render();
        }
    } catch (e) {
        error = "Error: Audio export failed: " + e.toString();
    } finally {
        try { if (item) item.remove(); } catch (eRemove) {}
        for (var sb = 0; sb < soloBackup.length; sb++) {
            try { soloBackup[sb].layer.solo = soloBackup[sb].solo; } catch (eSoloBack) {}
        }
        for (var k = 0; k < paused.length; k++) {
            try { paused[k].render = true; } catch (eRestore) {}
        }
        app.endSuppressDialogs(false);
    }
    if (error) return error;

    // AE may adjust the extension; accept whatever WAV it wrote next to our path.
    if (!outFile.exists) {
        var alt = new File(outFile.fsName.replace(/\.wav$/i, "") + ".wav");
        if (alt.exists) outFile = alt;
    }
    if (!outFile.exists) return "Error: After Effects did not write the audio file.";

    return "{"
        + "\"path\":\"" + _escapeJSONValue(outFile.fsName) + "\","
        + "\"name\":\"" + _escapeJSONValue(File.decode(outFile.name)) + "\","
        + "\"duration\":" + _aeSafeFloat(comp.duration, 0) + ","
        + "\"projectDir\":\"" + _escapeJSONValue(app.project.file ? app.project.file.parent.fsName : "") + "\","
        + "\"compName\":\"" + _escapeJSONValue(comp.name) + "\","
        + "\"sourceLayers\":\"" + sourceLayers.join(",") + "\""
        + "}";
}


// Caption layers carry "<groupTag>\n<signature>" in their comment. AE may store that line break
// as \r, so accept any line-break style (and the tag anywhere in the comment as a fallback).
function _leoCommentHasGroupTag(comment, tag) {
    var c = String(comment || "");
    if (!tag || !c) return false;
    if (c.split(/[\r\n]+/)[0] === tag) return true;
    var at = c.indexOf(tag);
    if (at === -1) return false;
    var after = c.charAt(at + tag.length);
    return after === "" || after === "\r" || after === "\n";
}

// ---- Captions: never show two captions at once ----
// Trims each caption layer of one apply group (comment starts with groupTag) so it ends exactly
// where the next caption begins. Only outPoint is changed (setting inPoint is unreliable here).
function leoResolveCaptionOverlaps(groupTag) {
    var comp = _aeActiveComp();
    if (!comp) return "Error: Open the caption composition first.";
    var tag = String(groupTag || "");
    if (!tag) return "Error: Missing caption group.";

    var layers = [];
    for (var i = 1; i <= comp.numLayers; i++) {
        try {
            var l = comp.layer(i);
            if (_leoCommentHasGroupTag(l.comment, tag)) layers.push(l);
        } catch (e) {}
    }
    if (layers.length < 2) return "No overlaps.";
    layers.sort(function (a, b) { return a.inPoint - b.inPoint; });

    var frame = comp.frameDuration;
    var fixed = 0;
    app.beginUndoGroup("Remove Caption Overlaps");
    try {
        for (var j = 0; j < layers.length - 1; j++) {
            var cur = layers[j];
            var nextIn = layers[j + 1].inPoint;
            if (cur.outPoint <= nextIn + frame / 2) continue;
            // Never shrink a caption to a sliver (e.g. a duplicate starting at the same time).
            if (nextIn - cur.inPoint < frame * 2) continue;
            var newOut = Math.max(cur.inPoint + frame, nextIn);
            var wasLocked = cur.locked;
            if (wasLocked) cur.locked = false;
            cur.outPoint = newOut;
            if (wasLocked) cur.locked = true;
            fixed++;
        }
    } catch (err) {
        return "Error: " + err.toString();
    } finally {
        app.endUndoGroup();
    }
    return fixed ? ("Trimmed " + fixed + " overlapping caption" + (fixed > 1 ? "s" : "") + ".") : "No overlaps.";
}


// ---- Captions: exact speech timing ----
// captions: [{ text, start, end }] in comp seconds, in caption order (from the panel's plan).
// Each caption layer of the group is moved (startTime, never inPoint) so it starts on its first
// word, and trimmed (outPoint) to end on its last word, never past the next caption's start.
function _leoNormCaptionText(s) {
    return String(s || "").toLowerCase().replace(/[\s.,!?;:"'`\-…()\[\]{}]+/g, "");
}

function leoApplyExactCaptionTiming(groupTag, captions) {
    var comp = _aeActiveComp();
    if (!comp) return "Error: Open the caption composition first.";
    var tag = String(groupTag || "");
    if (!tag || !captions || !captions.length) return "Error: Nothing to time.";

    var layers = [];
    for (var i = 1; i <= comp.numLayers; i++) {
        try {
            var l = comp.layer(i);
            if (!_leoCommentHasGroupTag(l.comment, tag)) continue;
            var txt = "";
            try { txt = l.property("Source Text").value.text; } catch (eTxt) {}
            layers.push({ layer: l, norm: _leoNormCaptionText(txt), used: false });
        } catch (e) {}
    }
    if (!layers.length) return "Error: Caption layers not found.";

    var fd = comp.frameDuration;
    function snap(t) { return Math.round(t / fd) * fd; }

    // Target times: start on the first word, end on the last word (at least ~0.25s so single short
    // words stay readable), but never past the next caption's start.
    var targets = [];
    for (var c = 0; c < captions.length; c++) {
        var st = snap(Math.max(0, Number(captions[c].start) || 0));
        var en = snap(Number(captions[c].end) || 0);
        if (!(en > st)) en = st + fd;
        en = Math.max(en, st + snap(0.25));
        targets.push({ norm: _leoNormCaptionText(captions[c].text), start: st, end: en, entry: null });
    }
    for (var n = 0; n < targets.length - 1; n++) {
        if (targets[n].end > targets[n + 1].start) targets[n].end = Math.max(targets[n].start + fd, targets[n + 1].start);
    }

    // Match captions to layers by text (closest current start wins), then pair leftovers by order.
    for (var a = 0; a < targets.length; a++) {
        var best = null;
        for (var b = 0; b < layers.length; b++) {
            var L = layers[b];
            if (L.used || !targets[a].norm || L.norm !== targets[a].norm) continue;
            if (!best || Math.abs(L.layer.inPoint - targets[a].start) < Math.abs(best.layer.inPoint - targets[a].start)) best = L;
        }
        if (best) { best.used = true; targets[a].entry = best; }
    }
    var spare = [];
    for (var s = 0; s < layers.length; s++) if (!layers[s].used) spare.push(layers[s]);
    spare.sort(function (x, y) { return x.layer.inPoint - y.layer.inPoint || y.layer.index - x.layer.index; });
    for (var q = 0, sp = 0; q < targets.length && sp < spare.length; q++) {
        if (!targets[q].entry) { targets[q].entry = spare[sp++]; targets[q].entry.used = true; }
    }

    var timed = 0;
    app.beginUndoGroup("Exact Caption Timing");
    try {
        for (var k = 0; k < targets.length; k++) {
            var tgt = targets[k];
            if (!tgt.entry) continue;
            var lyr = tgt.entry.layer;
            var wasLocked = lyr.locked;
            if (wasLocked) lyr.locked = false;
            var shift = tgt.start - lyr.inPoint;
            if (Math.abs(shift) > fd / 10) lyr.startTime += shift; // moves the whole layer + keyframes
            lyr.outPoint = tgt.end;
            if (wasLocked) lyr.locked = true;
            timed++;
        }
    } catch (err) {
        return "Error: " + err.toString();
    } finally {
        app.endUndoGroup();
    }
    return "Timed " + timed + " caption" + (timed === 1 ? "" : "s") + " to the speech.";
}


// ---- Generate Captions: replace the previous run ----
// Removes text layers created by earlier "Generate Captions" runs in the active comp. Those carry a
// group tag built from the generated audio name ("DRIPZ_CAPTION_GROUP::leo-comp-audio-...").
// Captions from uploaded files and all other layers are left alone.
function leoRemoveGeneratedCaptions() {
    var comp = _aeActiveComp();
    if (!comp) return "Error: Open the caption composition first.";
    var removed = 0;
    app.beginUndoGroup("Remove Previous Generated Captions");
    try {
        for (var i = comp.numLayers; i >= 1; i--) {
            var l = comp.layer(i);
            if (!(l instanceof TextLayer)) continue;
            if (String(l.comment || "").indexOf("DRIPZ_CAPTION_GROUP::leo-comp-audio-") === -1) continue;
            if (l.locked) l.locked = false;
            l.remove();
            removed++;
        }
    } catch (e) {
        return "Error: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
    return "Removed " + removed + " previous caption layer" + (removed === 1 ? "" : "s") + ".";
}


// ---- Audio Enhancer: bring the enhanced WAV back into the comp ----
// Imports wavPath into the project folder "LEO Enhanced Audio", adds it to the active comp at 0:00
// (the source was rendered from comp time 0, so it lines up exactly) and optionally mutes the originals:
// the layers listed in sourceCsv (layer indices from the export) or, if empty, every audible layer.
function leoImportEnhancedAudio(wavPath, muteOriginal, sourceCsv) {
    var comp = _aeActiveComp();
    if (!comp) return "Error: Open the composition first.";
    var f = new File(wavPath);
    if (!f.exists) return "Error: Enhanced audio file not found: " + wavPath;

    var wanted = {};
    var onlyListed = false;
    var parts = String(sourceCsv || "").split(",");
    for (var p = 0; p < parts.length; p++) {
        var n = parseInt(parts[p], 10);
        if (!isNaN(n)) { wanted[n] = true; onlyListed = true; }
    }

    var muted = 0;
    app.beginUndoGroup("Add Enhanced Audio");
    try {
        if (muteOriginal) {
            // Before adding the new layer, so the exported layer indices still match.
            for (var i = 1; i <= comp.numLayers; i++) {
                var l = comp.layer(i);
                if (onlyListed && !wanted[i]) continue;
                try {
                    if ((l instanceof AVLayer) && l.hasAudio && l.audioEnabled) {
                        var wasLocked = l.locked;
                        if (wasLocked) l.locked = false;
                        l.audioEnabled = false;
                        if (wasLocked) l.locked = true;
                        muted++;
                    }
                } catch (eMute) {}
            }
        }

        var item = app.project.importFile(new ImportOptions(f));
        var folder = null;
        for (var k = 1; k <= app.project.numItems; k++) {
            var it = app.project.item(k);
            if ((it instanceof FolderItem) && it.name === "LEO Enhanced Audio") { folder = it; break; }
        }
        if (!folder) folder = app.project.items.addFolder("LEO Enhanced Audio");
        try { item.parentFolder = folder; } catch (eFolder) {}

        var layer = comp.layers.add(item);
        layer.startTime = 0;
        layer.name = "Enhanced Audio (LEO)";
        try { layer.moveToBeginning(); } catch (eMove) {}
    } catch (e) {
        return "Error: Could not add the enhanced audio: " + e.toString();
    } finally {
        app.endUndoGroup();
    }
    return "Added enhanced audio to " + comp.name + (muted ? " and muted " + muted + " original audio layer" + (muted === 1 ? "" : "s") : "") + ".";
}


// ---- Captions: fade each word on as it is spoken ----
// Adds a text animator "LEO Word Fade" (Opacity 0%, Range Selector counting words by index) and keys its
// Start so word k fades in over `fade` seconds at the moment it is spoken. Re-running replaces it.
function _leoFindChild(group, matchNames, displayNames) {
    for (var i = 1; i <= group.numProperties; i++) {
        var p = group.property(i);
        for (var m = 0; m < matchNames.length; m++) if (p.matchName === matchNames[m]) return p;
        for (var d = 0; d < displayNames.length; d++) if (p.name === displayNames[d]) return p;
    }
    return null;
}

function _leoCountWords(text) {
    var parts = String(text || "").split(/[\s\u0003]+/);
    var n = 0;
    for (var i = 0; i < parts.length; i++) if (parts[i] !== "") n++;
    return n;
}

function _leoRemoveWordFade(layer) {
    function animators() { return layer.property("ADBE Text Properties").property("ADBE Text Animators"); }
    for (var r = animators().numProperties; r >= 1; r--) {
        if (animators().property(r).name === "LEO Word Fade") animators().property(r).remove();
    }
}

// mode: "fade" (opacity) or "fadeup" (opacity + words rise into place).
function _leoAddWordFadeToLayer(layer, wordTimes, fade, frame, mode) {
    var textDoc = layer.property("ADBE Text Properties").property("ADBE Text Document").value;
    var count = _leoCountWords(textDoc.text);
    if (count < 1 || !wordTimes || !wordTimes.length) return false;

    // One start time per word as AE counts them; spread evenly if the counts differ (edited captions).
    var times = [];
    if (wordTimes.length === count) {
        for (var w = 0; w < count; w++) times.push(Number(wordTimes[w]));
    } else {
        var t0 = Number(wordTimes[0]);
        var t1 = Number(wordTimes[wordTimes.length - 1]);
        for (var s = 0; s < count; s++) times.push(count > 1 ? t0 + (t1 - t0) * s / (count - 1) : t0);
    }

    // Adding or removing properties invalidates earlier references, so always re-fetch.
    function animators() { return layer.property("ADBE Text Properties").property("ADBE Text Animators"); }

    // Replace an earlier LEO Word Fade (Rebuild).
    for (var r = animators().numProperties; r >= 1; r--) {
        if (animators().property(r).name === "LEO Word Fade") animators().property(r).remove();
    }

    animators().addProperty("ADBE Text Animator");
    var animIndex = animators().numProperties;
    function anim() { return animators().property(animIndex); }
    anim().name = "LEO Word Fade";
    anim().property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity");
    anim().property("ADBE Text Animator Properties").property("ADBE Text Opacity").setValue(0);
    if (mode === "fadeup") {
        // Unspoken words sit a little lower and rise into place as they fade in.
        var rise = 20;
        try { rise = Math.max(10, Math.round(Number(textDoc.fontSize) * 0.35)); } catch (eSize) {}
        anim().property("ADBE Text Animator Properties").addProperty("ADBE Text Position 3D");
        anim().property("ADBE Text Animator Properties").property("ADBE Text Position 3D").setValue([0, rise, 0]);
    }
    anim().property("ADBE Text Selectors").addProperty("ADBE Text Selector");
    function sel() { return anim().property("ADBE Text Selectors").property(1); }

    var adv = sel().property("ADBE Text Range Advanced");
    adv.property("ADBE Text Range Units").setValue(2); // 1 = Percentage, 2 = Index
    var basedOn = _leoFindChild(sel().property("ADBE Text Range Advanced"), ["ADBE Text Range Type2", "ADBE Text Range Type"], ["Based On"]);
    if (!basedOn) throw new Error("Could not find the Range Selector 'Based On' setting.");
    basedOn.setValue(3); // 1 Characters, 2 Characters Excluding Spaces, 3 Words, 4 Lines

    sel().property("ADBE Text Index End").setValue(count);
    var start = sel().property("ADBE Text Index Start");
    // Start = number of words already revealed: k -> k + 1 over the fade while word k is spoken.
    var last = -1;
    for (var k = 0; k < count; k++) {
        var tk = Math.max(times[k], last + frame / 4);
        var f = fade;
        if (k + 1 < count) f = Math.max(frame, Math.min(fade, times[k + 1] - tk));
        start.setValueAtTime(tk, k);
        start.setValueAtTime(tk + f, k + 1);
        last = tk + f;
    }
    return true;
}

// items: [{ text, words: [start times in comp seconds] }] in caption order (from the panel).
// mode: "fade" (default), "fadeup", or "none" (Regular: removes an earlier LEO Word Fade).
function leoApplyWordFade(groupTag, items, fadeSec, mode) {
    var comp = _aeActiveComp();
    if (!comp) return "Error: Open the caption composition first.";
    var tag = String(groupTag || "");
    if (!tag || !items || !items.length) return "Error: Nothing to animate.";
    var fade = Math.max(0.02, Number(fadeSec) || 0.15);

    // Match caption layers of this apply group to items by text (like exact timing), then by order.
    var layers = [];
    for (var i = 1; i <= comp.numLayers; i++) {
        try {
            var l = comp.layer(i);
            if (!_leoCommentHasGroupTag(l.comment, tag)) continue;
            var txt = "";
            try { txt = l.property("Source Text").value.text; } catch (eTxt) {}
            layers.push({ layer: l, norm: _leoNormCaptionText(txt), used: false });
        } catch (e) {}
    }
    if (!layers.length) return "Error: Caption layers not found.";
    var pairs = [];
    for (var a = 0; a < items.length; a++) {
        var want = _leoNormCaptionText(items[a].text);
        var t0 = items[a].words && items[a].words.length ? Number(items[a].words[0]) : 0;
        var best = null;
        for (var b = 0; b < layers.length; b++) {
            var L = layers[b];
            if (L.used || !want || L.norm !== want) continue;
            if (!best || Math.abs(L.layer.inPoint - t0) < Math.abs(best.layer.inPoint - t0)) best = L;
        }
        if (best) { best.used = true; pairs.push({ entry: best, item: items[a] }); }
        else pairs.push({ entry: null, item: items[a] });
    }
    var spare = [];
    for (var s = 0; s < layers.length; s++) if (!layers[s].used) spare.push(layers[s]);
    spare.sort(function (x, y) { return x.layer.inPoint - y.layer.inPoint; });
    for (var q = 0, sp = 0; q < pairs.length && sp < spare.length; q++) {
        if (!pairs[q].entry) { pairs[q].entry = spare[sp++]; pairs[q].entry.used = true; }
    }

    var done = 0;
    var failed = "";
    app.beginUndoGroup("Word Fade On");
    try {
        for (var k = 0; k < pairs.length; k++) {
            if (!pairs[k].entry) continue;
            var lyr = pairs[k].entry.layer;
            var wasLocked = lyr.locked;
            if (wasLocked) lyr.locked = false;
            try {
                if (mode === "none") {
                    _leoRemoveWordFade(lyr);
                    done++;
                } else if (_leoAddWordFadeToLayer(lyr, pairs[k].item.words, fade, comp.frameDuration, mode === "fadeup" ? "fadeup" : "fade")) {
                    done++;
                }
            } catch (eLayer) {
                failed = eLayer.toString();
            }
            if (wasLocked) lyr.locked = true;
        }
    } finally {
        app.endUndoGroup();
    }
    if (!done && failed) return "Error: " + failed;
    if (mode === "none") return "Regular captions (no word animation).";
    return (mode === "fadeup" ? "Fade up" : "Fade in") + " words added to " + done + " caption" + (done === 1 ? "" : "s") + ".";
}
