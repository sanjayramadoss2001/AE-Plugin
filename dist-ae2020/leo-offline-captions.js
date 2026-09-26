/*
 * LEO offline captions — speech-to-text on this PC with whisper.cpp (no API key, no credits).
 *
 * Exposes window.LeoOfflineCaptions, used by the Captions tab in assets/index.js:
 *   getStatus()                 -> { supported, engineInstalled, installedModels, model, language, ready, installing, progress, stage, error }
 *   subscribe(fn)               -> unsubscribe function; fn(status) runs on every status change
 *   setModel(id) / setLanguage(code) / setNoOverlap(bool)
 *   install()                   -> downloads the engine (once) and the selected model
 *   transcribe(file, onProgress)-> Promise<{ text, words: [{ text, start, end }] }>  (same shape the ElevenLabs path returned)
 *   openFolder()
 *
 * Files live in %APPDATA%\LEO\offline-captions\ (engine\Release\whisper-cli.exe, models\ggml-*.bin).
 * Plain ES2017 so it runs in the CEF of AE 2020+ (no optional chaining / ??).
 */
(function () {
  "use strict";

  var WHISPER_VERSION = "v1.9.2";
  var ENGINE = {
    url: "https://github.com/ggml-org/whisper.cpp/releases/download/" + WHISPER_VERSION + "/whisper-bin-x64.zip",
    bytes: 8194445,
  };
  var MODEL_BASE_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";
  var MODELS = [
    { id: "base", label: "Fast", file: "ggml-base.bin", dtw: "base", bytes: 147951465, note: "Quick, good for clear English" },
    { id: "small", label: "Accurate", file: "ggml-small.bin", dtw: "small", bytes: 487601967, note: "Better words and accents" },
    { id: "turbo", label: "Best", file: "ggml-large-v3-turbo-q5_0.bin", dtw: "large.v3.turbo", bytes: 574041195, note: "Highest accuracy, Indian languages" },
  ];
  var LANGUAGES = [
    ["auto", "Auto detect"], ["en", "English"], ["hi", "Hindi"], ["ta", "Tamil"], ["te", "Telugu"],
    ["ml", "Malayalam"], ["kn", "Kannada"], ["bn", "Bengali"], ["mr", "Marathi"], ["gu", "Gujarati"],
    ["pa", "Punjabi"], ["ur", "Urdu"], ["es", "Spanish"], ["fr", "French"], ["de", "German"],
    ["pt", "Portuguese"], ["ar", "Arabic"],
  ];
  var DIRECT_AUDIO_EXTS = ["wav", "mp3", "flac", "ogg"]; // formats whisper-cli can read itself
  var KEY_MODEL = "leo_offline_model";
  var KEY_LANGUAGE = "leo_offline_language";
  var KEY_NO_OVERLAP = "leo_caption_no_overlap"; // "1" (default): trim captions so only one shows at a time

  var listeners = [];
  var state = {
    installing: false,
    progress: 0,
    stage: "",
    error: "",
  };

  // ---------- environment ----------

  function nodeRequire() {
    var w = window;
    if (typeof w.require === "function") return w.require;
    if (w.cep_node && typeof w.cep_node.require === "function") return w.cep_node.require;
    return null;
  }

  function node() {
    var req = nodeRequire();
    if (!req) throw new Error("Node.js is not available in this panel (CEP), so offline captions cannot run.");
    return {
      fs: req("fs"),
      path: req("path"),
      os: req("os"),
      cp: req("child_process"),
      proc: req("process"),
      Buffer: req("buffer").Buffer,
    };
  }

  function isWindows() {
    try {
      return node().os.platform() === "win32";
    } catch (e) {
      return /win/i.test(navigator.platform || "");
    }
  }

  function paths() {
    var n = node();
    var appData = (n.proc.env && n.proc.env.APPDATA) || n.path.join(n.os.homedir(), "AppData", "Roaming");
    var root = n.path.join(appData, "LEO", "offline-captions");
    var engineDir = n.path.join(root, "engine");
    return {
      root: root,
      engineDir: engineDir,
      cli: n.path.join(engineDir, "Release", "whisper-cli.exe"),
      modelsDir: n.path.join(root, "models"),
    };
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
    return exeName; // fall back to PATH
  }

  // Manual recursive mkdir: AE 2020's CEP ships Node 8, which lacks { recursive: true }.
  function mkdirp(dir) {
    var n = node();
    if (n.fs.existsSync(dir)) return;
    mkdirp(n.path.dirname(dir));
    n.fs.mkdirSync(dir);
  }

  function readSetting(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeSetting(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  function findModel(id) {
    for (var i = 0; i < MODELS.length; i++) if (MODELS[i].id === id) return MODELS[i];
    return MODELS[0];
  }

  function modelPath(model) {
    return node().path.join(paths().modelsDir, model.file);
  }

  function isModelInstalled(model) {
    try {
      var n = node();
      var p = modelPath(model);
      return n.fs.existsSync(p) && n.fs.statSync(p).size >= model.bytes * 0.98;
    } catch (e) {
      return false;
    }
  }

  function isEngineInstalled() {
    try {
      return node().fs.existsSync(paths().cli);
    } catch (e) {
      return false;
    }
  }

  // ---------- status ----------

  function getStatus() {
    var supported = !!nodeRequire() && isWindows();
    var model = findModel(readSetting(KEY_MODEL, "base"));
    var engineInstalled = supported && isEngineInstalled();
    var installedModels = supported
      ? MODELS.filter(isModelInstalled).map(function (m) {
          return m.id;
        })
      : [];
    return {
      supported: supported,
      engineInstalled: engineInstalled,
      installedModels: installedModels,
      models: MODELS,
      languages: LANGUAGES,
      model: model.id,
      language: readSetting(KEY_LANGUAGE, "auto"),
      noOverlap: readSetting(KEY_NO_OVERLAP, "1") !== "0",
      ready: supported && engineInstalled && installedModels.indexOf(model.id) !== -1 && !state.installing,
      installing: state.installing,
      progress: state.progress,
      stage: state.stage,
      error: state.error,
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

  function setModel(id) {
    writeSetting(KEY_MODEL, findModel(id).id);
    notify();
  }

  function setNoOverlap(on) {
    writeSetting(KEY_NO_OVERLAP, on ? "1" : "0");
    notify();
  }

  function setLanguage(code) {
    writeSetting(KEY_LANGUAGE, code || "auto");
    notify();
  }

  // ---------- install ----------

  function run(file, args, options) {
    var n = node();
    return new Promise(function (resolve, reject) {
      n.cp.execFile(file, args, Object.assign({ windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, options || {}), function (err, stdout, stderr) {
        if (err) {
          var detail = String(stderr || stdout || err.message || "").trim().split(/\r?\n/).slice(-3).join(" ");
          reject(new Error(detail || String(err)));
          return;
        }
        resolve(stdout);
      });
    });
  }

  // Downloads url to dest with curl.exe (the same tool the panel already uses for HTTPS),
  // reporting 0..1 progress by watching the partial file grow.
  function download(url, dest, expectedBytes, onFraction) {
    var n = node();
    var partial = dest + ".part";
    try {
      n.fs.unlinkSync(partial);
    } catch (e) {}
    var timer = setInterval(function () {
      try {
        var size = n.fs.statSync(partial).size;
        onFraction(Math.min(0.99, size / expectedBytes));
      } catch (e) {}
    }, 400);
    return run(systemTool("curl.exe"), ["-sS", "-L", "--fail", "--retry", "2", "--connect-timeout", "30", "-o", partial, url])
      .then(function () {
        clearInterval(timer);
        var size = n.fs.statSync(partial).size;
        if (size < expectedBytes * 0.98) throw new Error("Download was incomplete (" + size + " of " + expectedBytes + " bytes). Try again.");
        try {
          n.fs.unlinkSync(dest);
        } catch (e) {}
        n.fs.renameSync(partial, dest);
        onFraction(1);
      })
      .catch(function (err) {
        clearInterval(timer);
        try {
          n.fs.unlinkSync(partial);
        } catch (e) {}
        throw new Error("Download failed: " + err.message);
      });
  }

  function extractZip(zip, destDir) {
    mkdirp(destDir);
    return run(systemTool("tar.exe"), ["-xf", zip, "-C", destDir]).catch(function () {
      // Older Windows without tar.exe
      return run(systemTool("WindowsPowerShell\\v1.0\\powershell.exe"), [
        "-NoProfile",
        "-Command",
        "Expand-Archive -Force -LiteralPath '" + zip.replace(/'/g, "''") + "' -DestinationPath '" + destDir.replace(/'/g, "''") + "'",
      ]);
    });
  }

  function setInstallState(patch) {
    Object.assign(state, patch);
    notify();
  }

  async function install() {
    if (state.installing) return;
    var status = getStatus();
    if (!status.supported) throw new Error("Offline captions currently work on Windows only.");
    var n = node();
    var p = paths();
    var model = findModel(status.model);
    var needEngine = !status.engineInstalled;
    var needModel = status.installedModels.indexOf(model.id) === -1;
    var total = (needEngine ? ENGINE.bytes : 0) + (needModel ? model.bytes : 0);
    var engineShare = total ? (needEngine ? ENGINE.bytes : 0) / total : 0;

    setInstallState({ installing: true, progress: 0, stage: "Starting download...", error: "" });
    try {
      mkdirp(p.root);
      mkdirp(p.modelsDir);
      if (needEngine) {
        var zip = n.path.join(p.root, "whisper-bin-x64.zip");
        await download(ENGINE.url, zip, ENGINE.bytes, function (f) {
          setInstallState({ progress: f * engineShare, stage: "Downloading caption engine..." });
        });
        setInstallState({ stage: "Unpacking caption engine..." });
        await extractZip(zip, p.engineDir);
        try {
          n.fs.unlinkSync(zip);
        } catch (e) {}
        if (!isEngineInstalled()) throw new Error("The caption engine did not unpack correctly. Try again.");
      }
      if (needModel) {
        await download(MODEL_BASE_URL + model.file, modelPath(model), model.bytes, function (f) {
          setInstallState({
            progress: engineShare + f * (1 - engineShare),
            stage: "Downloading " + model.label + " model (" + Math.round(model.bytes / 1e6) + " MB)...",
          });
        });
      }
      setInstallState({ installing: false, progress: 1, stage: "", error: "" });
    } catch (err) {
      setInstallState({ installing: false, progress: 0, stage: "", error: err.message });
      throw err;
    }
  }

  function openFolder() {
    var p = paths();
    mkdirp(p.root);
    node().cp.execFile("explorer.exe", [p.root]);
  }

  // ---------- audio ----------

  function fileExt(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  function readArrayBuffer(file) {
    if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(reader.error || new Error("Could not read the file."));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // Decode any audio/video the panel's browser engine understands and return 16 kHz mono samples.
  async function decodeToMono16k(arrayBuffer) {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    var ctx = new Ctx();
    var decoded;
    try {
      decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      try {
        ctx.close();
      } catch (e) {}
    }
    try {
      var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      var off = new Offline(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
      var src = off.createBufferSource();
      src.buffer = decoded;
      src.connect(off.destination);
      src.start(0);
      var rendered = await off.startRendering();
      return { samples: rendered.getChannelData(0), sampleRate: 16000 };
    } catch (e) {
      // Older engines without 16 kHz offline rendering: mix down at the original rate (whisper resamples).
      var len = decoded.length;
      var mono = new Float32Array(len);
      for (var c = 0; c < decoded.numberOfChannels; c++) {
        var data = decoded.getChannelData(c);
        for (var i = 0; i < len; i++) mono[i] += data[i] / decoded.numberOfChannels;
      }
      return { samples: mono, sampleRate: decoded.sampleRate };
    }
  }

  function encodeWav16(samples, sampleRate) {
    var buffer = new ArrayBuffer(44 + samples.length * 2);
    var view = new DataView(buffer);
    function str(offset, s) {
      for (var i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    }
    str(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    str(8, "WAVE");
    str(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, "data");
    view.setUint32(40, samples.length * 2, true);
    for (var i = 0, o = 44; i < samples.length; i++, o += 2) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  // ---------- whisper output -> words ----------

  var PUNCT_ONLY = /^[\s.,!?;:"'`()\[\]{}\u2026\u00bf\u00a1\u0964\u0965\-]+$/;
  var LATIN = /[A-Za-z]/;

  // DTW (-dtw) token times are far more accurate than whisper's own token offsets: measured on an
  // exact-timing test clip, word starts ~50 ms off (vs ~0.9 s with large-v3-turbo offsets) and ends
  // ~35 ms off. t_dtw (10 ms units) lands late in a token, so starts are pulled back and ends pushed out.
  var DTW_START_BACK = 0.2;
  var DTW_END_FORWARD = 0.08;

  function dtwSeconds(token) {
    var v = token && typeof token.t_dtw === "number" ? token.t_dtw : -1;
    return v >= 0 ? v / 100 : null;
  }

  function wordsFromWhisperJson(json) {
    var segments = (json && json.transcription) || [];
    var words = [];
    var prevEnd = 0;
    segments.forEach(function (seg) {
      var text = String(seg.text || "").trim();
      if (!text) return;
      var start = seg.offsets.from / 1000;
      var end = seg.offsets.to / 1000;
      // With --split-on-word each segment is one word; its "to" can stretch across the pause after
      // punctuation, so end the word at its last real (non-punctuation, non-special) token instead.
      var tokens = (seg.tokens || []).filter(function (t) {
        return !/^\[_.*\]$/.test(String(t.text || ""));
      });
      if (tokens.length) {
        start = tokens[0].offsets.from / 1000;
        for (var i = tokens.length - 1; i >= 0; i--) {
          if (!PUNCT_ONLY.test(String(tokens[i].text || ""))) {
            end = tokens[i].offsets.to / 1000;
            break;
          }
        }
      }
      // Prefer DTW alignment when whisper-cli produced it for this word's real tokens.
      var real = tokens.filter(function (t) {
        return !PUNCT_ONLY.test(String(t.text || ""));
      });
      var dFirst = real.length ? dtwSeconds(real[0]) : null;
      var dLast = real.length ? dtwSeconds(real[real.length - 1]) : null;
      if (dFirst !== null && dLast !== null && dLast >= dFirst) {
        start = Math.max(0, prevEnd, dFirst - DTW_START_BACK);
        end = dLast + DTW_END_FORWARD;
        if (end < start + 0.08) end = start + 0.08;
      }
      if (!(end > start)) end = Math.max(seg.offsets.to / 1000, start + 0.05);
      if (!(end > start)) end = start + 0.05;
      words.push({ text: text, start: start, end: end });
      prevEnd = end;
    });

    // Light sentence case for Latin-script text (small models often return all lowercase).
    var capitalizeNext = true;
    words.forEach(function (w) {
      if (capitalizeNext && LATIN.test(w.text.charAt(0))) w.text = w.text.charAt(0).toUpperCase() + w.text.slice(1);
      capitalizeNext = /[.!?]["')\]]*$/.test(w.text);
    });
    for (var j = 0; j < words.length; j++) {
      if (words[j].text === "i" || /^i'/.test(words[j].text)) words[j].text = "I" + words[j].text.slice(1);
    }
    return words;
  }

  // ---------- transcribe ----------

  function runWhisper(args, cwd, onPercent) {
    var n = node();
    return new Promise(function (resolve, reject) {
      var child = n.cp.spawn(paths().cli, args, { cwd: cwd, windowsHide: true });
      var errTail = "";
      child.stdout.on("data", function () {});
      child.stderr.on("data", function (chunk) {
        var s = String(chunk);
        errTail = (errTail + s).slice(-2000);
        var re = /progress\s*=\s*(\d+)%/g;
        var m;
        while ((m = re.exec(s))) onPercent(parseInt(m[1], 10));
      });
      child.on("error", function (err) {
        reject(new Error("Could not start the caption engine: " + err.message));
      });
      child.on("close", function (code) {
        if (code === 0) resolve();
        else {
          var lines = errTail.trim().split(/\r?\n/).filter(Boolean);
          reject(new Error("Caption engine stopped (code " + code + "). " + (lines.slice(-2).join(" ") || "")));
        }
      });
    });
  }

  async function transcribe(file, onProgress) {
    var status = getStatus();
    if (!status.ready) throw new Error("Offline captions are not set up yet. Download the caption model in Caption Setup first.");
    var report = typeof onProgress === "function" ? onProgress : function () {};
    var n = node();
    var model = findModel(status.model);
    var stamp = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    var tmpBase = n.path.join(n.os.tmpdir(), "leo-captions-" + stamp);
    var inputPath = tmpBase + ".wav";
    var temps = [inputPath, tmpBase + ".json"];

    try {
      report("Reading audio...", 0);
      var bytes = await readArrayBuffer(file);
      try {
        var audio = await decodeToMono16k(bytes);
        n.fs.writeFileSync(inputPath, n.Buffer.from(encodeWav16(audio.samples, audio.sampleRate)));
      } catch (decodeErr) {
        var ext = fileExt(file.name);
        if (DIRECT_AUDIO_EXTS.indexOf(ext) === -1) {
          throw new Error("Couldn't read the audio in this file. Export the audio as WAV or MP3 and upload that instead.");
        }
        inputPath = tmpBase + "." + ext;
        temps.push(inputPath);
        n.fs.writeFileSync(inputPath, n.Buffer.from(bytes));
      }

      report("Transcribing on this PC...", 0);
      var threads = Math.max(1, Math.min(8, (n.os.cpus() || []).length || 4));
      var args = [
        "-m", modelPath(model),
        "-f", inputPath,
        "-l", status.language || "auto",
        "-t", String(threads),
        "-ml", "1",
        "-sow",
        "-dtw", model.dtw,
        "-nfa", // DTW timestamps need flash attention off
        "-ojf",
        "-of", tmpBase,
        "-pp",
      ];
      await runWhisper(args, n.path.dirname(paths().cli), function (pct) {
        report("Transcribing on this PC... " + pct + "%", pct / 100);
      });

      var json = JSON.parse(n.fs.readFileSync(tmpBase + ".json", "utf8"));
      var words = wordsFromWhisperJson(json);
      return {
        text: words.map(function (w) { return w.text; }).join(" ").trim(),
        words: words,
        language: json.result && json.result.language,
      };
    } finally {
      temps.forEach(function (p) {
        try {
          n.fs.unlinkSync(p);
        } catch (e) {}
      });
    }
  }

  window.LeoOfflineCaptions = {
    getStatus: getStatus,
    subscribe: subscribe,
    setModel: setModel,
    setLanguage: setLanguage,
    setNoOverlap: setNoOverlap,
    install: install,
    transcribe: transcribe,
    openFolder: openFolder,
    // exposed for testing
    _wordsFromWhisperJson: wordsFromWhisperJson,
    _encodeWav16: encodeWav16,
    _decodeToMono16k: decodeToMono16k,
  };
})();
