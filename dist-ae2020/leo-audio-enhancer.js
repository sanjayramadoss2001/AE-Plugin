/*
 * LEO Audio Enhancer — offline speech enhancement with DeepFilterNet3 (deep-filter.exe, model built in).
 *
 * Exposes window.LeoAudioEnhancer, used by the Audio tab in assets/index.js:
 *   getStatus()                    -> { supported, installed, installing, progress, stage, error, strength, strengths, muteOriginal }
 *   subscribe(fn)                  -> unsubscribe; fn(status) on every change
 *   setStrength(id) / setMuteOriginal(bool)
 *   install()                      -> downloads deep-filter.exe once (~27 MB)
 *   enhance(inputWav, outputWav, strengthId?) -> Promise<outputWav>; 48 kHz in/out, delay-compensated (stays in sync)
 *                                  (strengthId overrides the Audio tab setting, e.g. for caption pre-cleaning)
 *   openFolder()
 *
 * The engine lives in %APPDATA%\LEO\audio-enhancer\deep-filter.exe.
 * Measured on a noisy 48 kHz test clip: noise floor -33 dB (Strong) / -40 dB (Max), speech level kept,
 * 0 ms offset with -D. Plain ES2017 for the CEF in AE 2020+.
 */
(function () {
  "use strict";

  var ENGINE = {
    version: "0.5.6",
    url: "https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/deep-filter-0.5.6-x86_64-pc-windows-msvc.exe",
    bytes: 26912256,
  };
  // -a = attenuation limit in dB (how much noise may be removed); --pf = extra post-filter.
  var STRENGTHS = [
    { id: "light", label: "Light", note: "Keeps some room tone", args: ["-a", "12"] },
    { id: "medium", label: "Medium", note: "Natural, clearly cleaner", args: ["-a", "24"] },
    { id: "strong", label: "Strong", note: "Removes most noise", args: [] },
    { id: "max", label: "Max", note: "Studio-dry voice", args: ["--pf"] },
  ];
  var KEY_STRENGTH = "leo_audio_enhance_strength";
  var KEY_MUTE = "leo_audio_enhance_mute_original";

  var listeners = [];
  var state = { installing: false, progress: 0, stage: "", error: "" };

  function nodeRequire() {
    var w = window;
    if (typeof w.require === "function") return w.require;
    if (w.cep_node && typeof w.cep_node.require === "function") return w.cep_node.require;
    return null;
  }

  function node() {
    var req = nodeRequire();
    if (!req) throw new Error("Node.js is not available in this panel (CEP), so the audio enhancer cannot run.");
    return { fs: req("fs"), path: req("path"), os: req("os"), cp: req("child_process"), proc: req("process") };
  }

  function isWindows() {
    try {
      return node().os.platform() === "win32";
    } catch (e) {
      return false;
    }
  }

  function paths() {
    var n = node();
    var appData = (n.proc.env && n.proc.env.APPDATA) || n.path.join(n.os.homedir(), "AppData", "Roaming");
    var root = n.path.join(appData, "LEO", "audio-enhancer");
    return { root: root, exe: n.path.join(root, "deep-filter.exe") };
  }

  // Manual recursive mkdir: AE 2020's CEP ships Node 8, which lacks { recursive: true }.
  function mkdirp(dir) {
    var n = node();
    if (n.fs.existsSync(dir)) return;
    mkdirp(n.path.dirname(dir));
    n.fs.mkdirSync(dir);
  }

  function systemTool(exeName) {
    var n = node();
    var roots = [n.proc.env.SystemRoot, n.proc.env.WINDIR, "C:\\Windows"].filter(function (v, i, a) {
      return !!v && a.indexOf(v) === i;
    });
    for (var i = 0; i < roots.length; i++) {
      var dirs = ["System32", "Sysnative", "SysWOW64"];
      for (var j = 0; j < dirs.length; j++) {
        var p = n.path.join(roots[i], dirs[j], exeName);
        if (n.fs.existsSync(p)) return p;
      }
    }
    return exeName;
  }

  function readSetting(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeSetting(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  function findStrength(id) {
    for (var i = 0; i < STRENGTHS.length; i++) if (STRENGTHS[i].id === id) return STRENGTHS[i];
    return STRENGTHS[2];
  }

  function isInstalled() {
    try {
      var n = node();
      var p = paths().exe;
      return n.fs.existsSync(p) && n.fs.statSync(p).size >= ENGINE.bytes * 0.98;
    } catch (e) {
      return false;
    }
  }

  function getStatus() {
    var supported = !!nodeRequire() && isWindows();
    return {
      supported: supported,
      installed: supported && isInstalled(),
      installing: state.installing,
      progress: state.progress,
      stage: state.stage,
      error: state.error,
      strength: findStrength(readSetting(KEY_STRENGTH, "strong")).id,
      strengths: STRENGTHS,
      muteOriginal: readSetting(KEY_MUTE, "1") !== "0",
      engineMB: Math.round(ENGINE.bytes / 1e6),
    };
  }

  function notify() {
    var status = getStatus();
    listeners.slice().forEach(function (fn) {
      try {
        fn(status);
      } catch (e) {}
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (l) {
        return l !== fn;
      });
    };
  }

  function setStrength(id) {
    writeSetting(KEY_STRENGTH, findStrength(id).id);
    notify();
  }

  function setMuteOriginal(on) {
    writeSetting(KEY_MUTE, on ? "1" : "0");
    notify();
  }

  function run(file, args) {
    var n = node();
    return new Promise(function (resolve, reject) {
      n.cp.execFile(file, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, function (err, stdout, stderr) {
        if (err) {
          var detail = String(stderr || stdout || err.message || "").trim().split(/\r?\n/).slice(-3).join(" ");
          reject(new Error(detail || String(err)));
          return;
        }
        resolve(stdout);
      });
    });
  }

  function setInstallState(patch) {
    Object.assign(state, patch);
    notify();
  }

  async function install() {
    if (state.installing) return;
    if (!getStatus().supported) throw new Error("The audio enhancer currently works on Windows only.");
    var n = node();
    var p = paths();
    var partial = p.exe + ".part";
    setInstallState({ installing: true, progress: 0, stage: "Downloading audio enhancer (" + Math.round(ENGINE.bytes / 1e6) + " MB)...", error: "" });
    var timer = setInterval(function () {
      try {
        setInstallState({ progress: Math.min(0.99, n.fs.statSync(partial).size / ENGINE.bytes) });
      } catch (e) {}
    }, 400);
    try {
      mkdirp(p.root);
      try {
        n.fs.unlinkSync(partial);
      } catch (e) {}
      await run(systemTool("curl.exe"), ["-sS", "-L", "--fail", "--retry", "2", "--connect-timeout", "30", "-o", partial, ENGINE.url]);
      var size = n.fs.statSync(partial).size;
      if (size < ENGINE.bytes * 0.98) throw new Error("Download was incomplete (" + size + " of " + ENGINE.bytes + " bytes). Try again.");
      try {
        n.fs.unlinkSync(p.exe);
      } catch (e) {}
      n.fs.renameSync(partial, p.exe);
      clearInterval(timer);
      setInstallState({ installing: false, progress: 1, stage: "", error: "" });
    } catch (err) {
      clearInterval(timer);
      try {
        n.fs.unlinkSync(partial);
      } catch (e) {}
      setInstallState({ installing: false, progress: 0, stage: "", error: "Download failed: " + err.message });
      throw err;
    }
  }

  // Enhance inputWav (48 kHz WAV) into outputWav. deep-filter writes <outDir>/<same name>, so it runs
  // into a private temp folder and the result is moved to outputWav.
  async function enhance(inputWav, outputWav, strengthId) {
    var status = getStatus();
    if (!status.installed) throw new Error("Download the audio enhancer first.");
    var n = node();
    var strength = findStrength(strengthId || status.strength);
    var tmpOut = n.path.join(n.os.tmpdir(), "leo-enhance-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
    mkdirp(tmpOut);
    try {
      // -D compensates the model's STFT/lookahead delay so the result stays frame-accurate with the video.
      await run(paths().exe, ["-D"].concat(strength.args, ["-o", tmpOut, inputWav]));
      var produced = n.path.join(tmpOut, n.path.basename(inputWav));
      if (!n.fs.existsSync(produced)) throw new Error("The enhancer did not produce an output file.");
      mkdirp(n.path.dirname(outputWav));
      try {
        n.fs.unlinkSync(outputWav);
      } catch (e) {}
      try {
        n.fs.renameSync(produced, outputWav);
      } catch (e) {
        // Different drive: copy instead of rename.
        n.fs.writeFileSync(outputWav, n.fs.readFileSync(produced));
        n.fs.unlinkSync(produced);
      }
      return outputWav;
    } finally {
      try {
        n.fs.rmdirSync(tmpOut);
      } catch (e) {}
    }
  }

  function openFolder() {
    var p = paths();
    mkdirp(p.root);
    node().cp.execFile("explorer.exe", [p.root]);
  }

  window.LeoAudioEnhancer = {
    getStatus: getStatus,
    subscribe: subscribe,
    setStrength: setStrength,
    setMuteOriginal: setMuteOriginal,
    install: install,
    enhance: enhance,
    openFolder: openFolder,
  };
})();
