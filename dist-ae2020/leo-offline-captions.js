/*
 * LEO offline captions — speech-to-text on this PC with whisper.cpp (no API key, no credits).
 *
 * Exposes window.LeoOfflineCaptions, used by the Captions tab in assets/index.js:
 *   getStatus()                 -> { supported, engineInstalled, installedModels, model, language, ready, installing, progress, stage, error }
 *   subscribe(fn)               -> unsubscribe function; fn(status) runs on every status change
 *   setModel(id) / setLanguage(code) / setNoOverlap(bool) / setCaptionStyle(single|voice|long)
 *   installAI() / groupWithAI(words, style?, onProgress?)  free offline AI grouping by meaning (llama.cpp)
 *   segmentLines(words, style?)  -> caption lines [{ text, start, end, lastWordStart }] (smart grouping)
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
  var KEY_NO_OVERLAP = "leo_caption_no_overlap";
  var KEY_WORD_FADE = "leo_caption_word_fade"; // legacy checkbox, migrated to KEY_ANIMATION
  var KEY_CAPTION_PRESET = "leo_caption_text_preset"; // JSON { name, path } of an .ffx applied to every caption
  var KEY_ANIMATION = "leo_caption_animation"; // "none" | "fade" | "fadeup", asked before each Generate
  var ANIMATIONS = [
    { id: "none", label: "Regular", note: "Plain captions, no word animation" },
    { id: "fade", label: "Fade Up Words", note: "Like After Effects' Fade Up Words, each word fades in as it is spoken" },
    { id: "fadeup", label: "Rise Up Words", note: "Each word fades in and slides up into place" },
  ];

  function currentAnimation() {
    // v2: "Fade up" used to add a rise; users who picked it wanted AE's Fade Up Words look -> "fade".
    if (readSetting("leo_caption_animation_v2", "") !== "1") {
      if (readSetting(KEY_ANIMATION, "") === "fadeup") writeSetting(KEY_ANIMATION, "fade");
      writeSetting("leo_caption_animation_v2", "1");
    }
    var id = readSetting(KEY_ANIMATION, "");
    if (id === "none" || id === "fade" || id === "fadeup") return id;
    return readSetting(KEY_WORD_FADE, "1") === "0" ? "none" : "fade";
  }
  var KEY_CLEAN_VOICE = "leo_caption_clean_voice"; // "1" (default): DeepFilterNet-clean the voice before Whisper // "1" (default): trim captions so only one shows at a time

  try {
    localStorage.removeItem("leo_claude_api_key");
  } catch (e) {}

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
      noOverlap: true, // exact speech timing is always on (minimal UI)
      animation: currentAnimation(),
      captionPreset: (function () {
        try {
          var v = JSON.parse(readSetting(KEY_CAPTION_PRESET, "null"));
          return v && v.path ? v : null;
        } catch (e) {
          return null;
        }
      })(),
      animations: ANIMATIONS,
      cleanVoice: readSetting(KEY_CLEAN_VOICE, "1") !== "0",
      captionStyle: currentStyleId(),
      aiInstalled: supported && isAiInstalled(),
      aiMB: Math.round((AI.engineBytes + AI.modelBytes) / 1e6),
      captionStyles: [CAPTION_STYLES.single, CAPTION_STYLES.voice, CAPTION_STYLES.long],
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

  function setCleanVoice(on) {
    writeSetting(KEY_CLEAN_VOICE, on ? "1" : "0");
    notify();
  }

  function setCaptionPreset(preset) {
    writeSetting(KEY_CAPTION_PRESET, preset && preset.path ? JSON.stringify({ name: preset.name, path: preset.path }) : "null");
    notify();
  }

  function setAnimation(id) {
    writeSetting(KEY_ANIMATION, id === "none" || id === "fadeup" ? id : "fade");
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

  // ---------- caption line builder ----------
  // Groups timed words into caption lines the way a human captioner would: hard breaks at sentence ends
  // and pauses; inside a sentence, the best set of breaks is chosen by dynamic programming so lines are
  // an easy-to-read size, never end on a word that leads into the next one ("the", "my", "to", ...),
  // prefer breaking at commas / pauses / before connectors, and avoid stranded one-word lines.
  // single: one word per caption. voice: whole phrases as the speaker says them (breaks where they
  // pause, keeps "what is your name" together). long: subtitle-style lines.
  var CAPTION_STYLES = {
    single: { id: "single", label: "Single", note: "One word at a time", single: true },
    voice: {
      id: "voice", label: "Perfect voice match", note: "Whole phrases, the way they're spoken",
      ideal: 4, sizeWeight: 0.35, maxWords: 7, maxChars: 32, maxDur: 3.5, pauseWeight: 16, pauseCap: 4, flowPenalty: 1.5,
    },
    long: {
      id: "long", label: "Long", note: "Subtitle lines",
      ideal: 6, sizeWeight: 1.2, maxWords: 9, maxChars: 42, maxDur: 5.0, pauseWeight: 10, pauseCap: 3, flowPenalty: 0,
    },
  };
  var LEGACY_STYLES = { short: "voice", medium: "voice" };

  function currentStyleId() {
    var id = readSetting(KEY_CAPTION_STYLE, "voice");
    id = LEGACY_STYLES[id] || id;
    return CAPTION_STYLES[id] ? id : "voice";
  }
  var KEY_CAPTION_STYLE = "leo_caption_style";
  var HARD_PAUSE = 0.5; // seconds of silence that always starts a new caption

  function wordSet(list) {
    var o = {};
    list.split(" ").forEach(function (w) {
      if (w) o[w] = true;
    });
    return o;
  }
  // Words that lead into the next word: a line should not end on them.
  // Strong: articles, possessives, prepositions, conjunctions/clause starters, subject pronouns.
  var WEAK_END = wordSet(
    "a an the my your his her our their its this these those some any every each " +
      "to of in on at for with from by into onto about over under after before " +
      "and but or nor because if when while until since though although than as then which who where " +
      "i i'm i'll i've i'd we we're they they're he she you you're it's gonna wanna gotta " +
      "मेरा मेरी मेरे तेरा तेरी तेरे उसका उसकी उसके इस उस यह वह एक और या लेकिन कि जो क्योंकि जब अगर तो",
  );
  // Soft: fine at a line end in a pinch (auxiliaries, intensifiers, negations).
  var SOFT_END = wordSet(
    "is are was were am be been being do does did has have had will would can could should " +
      "so very really just too not no don't can't won't didn't isn't wasn't बहुत",
  );
  // Words that attach to the previous word (Hindi/Urdu postpositions, auxiliaries): a line should not start with them.
  var WEAK_START = wordSet(
    "का की के को में से पर ने तक भी ही है हैं था थी थे हूँ हूं हो रहा रही रहे गया गई गए वाला वाली वाले " +
      "ka ki ke ko mein me se par ne tak bhi hi hai hain tha thi the hu hoon ho raha rahi rahe",
  );
  // Object pronouns usually belong to the verb before them ("sing it", "takes it from me").
  var SOFT_START = wordSet("it them me him us");
  // A good place to start a new line is just before these.
  var BREAK_BEFORE = wordSet(
    "and but so because when then if or while until since though although which who where " +
      "और लेकिन पर तो जब फिर क्योंकि अगर या",
  );

  function cleanWord(t) {
    return String(t || "")
      .toLowerCase()
      .replace(/^[^\wऀ-෿']+|[^\wऀ-෿']+$/g, "");
  }

  function lineCost(words, a, b, style, isChunkEnd) {
    // words[a..b) as one line
    var n = b - a;
    var chars = 0; // visible length: punctuation is stripped from captions later
    for (var i = a; i < b; i++) chars += words[i].visible + (i > a ? 1 : 0);
    if (n > style.maxWords) return Infinity;
    if (n > 1 && chars > style.maxChars) return Infinity;
    var cost = Math.pow(n - style.ideal, 2) * style.sizeWeight;
    if (chars > style.maxChars * 0.8) cost += (chars - style.maxChars * 0.8) * 0.15;
    var dur = words[b - 1].end - words[a].start;
    if (dur > style.maxDur) cost += (dur - style.maxDur) * 3;
    var last = words[b - 1];
    var first = words[a];
    if (n === 1) cost += 5; // stranded single word
    if (!isChunkEnd && WEAK_END[last.clean]) cost += 7; // "... your" | "name"
    else if (!isChunkEnd && SOFT_END[last.clean]) cost += 2.5; // "that is" | "my throne" is acceptable
    if (a > 0 && WEAK_START[first.clean]) cost += 9; // "... गाना" | "है"
    if (a > 0 && SOFT_START[first.clean]) {
      var before = words[a - 1];
      var separated = /[,;:.!?]["')\]]*$/.test(before.text) || first.start - before.end >= 0.25;
      if (!separated) cost += 2.5; // "sing" | "it"
    }
    if (!isChunkEnd) {
      var next = words[b];
      var gap = Math.max(0, next.start - last.end);
      var punct = /[,;:\u2014\u2013-]["')\]]*$/.test(last.text);
      if (punct) cost -= 4; // break after a comma
      if (BREAK_BEFORE[next.clean]) cost -= 1.5; // break before a connector
      cost -= Math.min(style.pauseCap, gap * style.pauseWeight); // break where the speaker pauses
      if (!punct && gap < 0.06) cost += style.flowPenalty; // don't cut into continuous speech
    }
    return cost;
  }

  function segmentChunk(words, a, b, style) {
    // Dynamic programming over break positions inside words[a..b).
    var best = [0];
    var from = [a];
    for (var i = a + 1; i <= b; i++) {
      best[i - a] = Infinity;
      for (var j = Math.max(a, i - style.maxWords); j < i; j++) {
        if (best[j - a] === Infinity) continue;
        var c = best[j - a] + lineCost(words, j, i, style, i === b);
        if (c < best[i - a]) {
          best[i - a] = c;
          from[i - a] = j;
        }
      }
      if (best[i - a] === Infinity) {
        // A single very long word: force it onto its own line.
        best[i - a] = best[i - 1 - a] + 10;
        from[i - a] = i - 1;
      }
    }
    var cuts = [];
    for (var k = b; k > a; k = from[k - a]) cuts.unshift([from[k - a], k]);
    return cuts;
  }

  function segmentLines(rawWords, styleId) {
    var style = CAPTION_STYLES[LEGACY_STYLES[styleId] || styleId] || CAPTION_STYLES[currentStyleId()];
    var words = (rawWords || [])
      .filter(function (w) {
        return w && String(w.text || "").trim() && isFinite(w.start) && isFinite(w.end);
      })
      .map(function (w) {
        var text = String(w.text).trim();
        return {
          text: text,
          start: Number(w.start),
          end: Number(w.end),
          clean: cleanWord(text),
          visible: text.replace(/[.,!?;:"\u2026]/g, "").length,
        };
      });
    var lines = [];
    if (!style.single && plannedGroups && plannedGroups.style === style.id && plannedGroups.key === wordsKey(words, style.id)) {
      plannedGroups.groups.forEach(function (g) {
        var ws = words.slice(g[0], g[1] + 1);
        if (!ws.length) return;
        lines.push({
          text: ws.map(function (x) { return x.text; }).join(" "),
          start: ws[0].start,
          end: ws[ws.length - 1].end,
          lastWordStart: ws.length > 1 ? ws[ws.length - 1].start : ws[ws.length - 1].end,
        });
      });
      if (lines.length) return lines;
    }
    if (style.single) {
      words.forEach(function (w) {
        lines.push({ text: w.text, start: w.start, end: w.end, lastWordStart: w.end });
      });
      return lines;
    }
    var chunkStart = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var next = words[i + 1];
      var sentenceEnd = /[.!?…।॥]["')\]]*$/.test(w.text);
      var pause = next ? next.start - w.end >= HARD_PAUSE : true;
      if (!next || sentenceEnd || pause) {
        segmentChunk(words, chunkStart, i + 1, style).forEach(function (cut) {
          var ws = words.slice(cut[0], cut[1]);
          lines.push({
            text: ws.map(function (x) { return x.text; }).join(" "),
            start: ws[0].start,
            end: ws[ws.length - 1].end,
            lastWordStart: ws.length > 1 ? ws[ws.length - 1].start : ws[ws.length - 1].end,
          });
        });
        chunkStart = i + 1;
      }
    }
    return lines;
  }

  function setCaptionStyle(id) {
    writeSetting(KEY_CAPTION_STYLE, CAPTION_STYLES[id] ? id : "voice");
    notify();
  }

  // ---------- free offline AI: group captions by meaning (llama.cpp + Qwen3.5-2B, runs on this PC) ----------
  // Whisper often writes run-on text ("i was just trolling the song is actually fire"); rules can't see
  // where the thought changes, a small language model can. Measured on test transcripts: every word kept,
  // sentence breaks found without punctuation, ~13 s for a minute of speech on CPU.
  var AI = {
    engineUrl: "https://github.com/ggml-org/llama.cpp/releases/download/b11200/llama-b11200-bin-win-cpu-x64.zip",
    engineBytes: 19154722,
    modelUrl: "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf",
    modelFile: "Qwen3.5-2B-Q4_K_M.gguf",
    modelBytes: 1280835840,
    chunkWords: 180,
  };
  var plannedGroups = null; // { key, style, groups: [[first, last], ...] } used by segmentLines

  function aiPaths() {
    var n = node();
    var dir = n.path.join(paths().root, "ai");
    return { dir: dir, exe: n.path.join(dir, "llama", "llama-completion.exe"), model: n.path.join(dir, AI.modelFile) };
  }

  function isAiInstalled() {
    try {
      var n = node();
      var p = aiPaths();
      return n.fs.existsSync(p.exe) && n.fs.existsSync(p.model) && n.fs.statSync(p.model).size >= AI.modelBytes * 0.98;
    } catch (e) {
      return false;
    }
  }

  async function installAI() {
    if (state.installing) return;
    var n = node();
    var p = aiPaths();
    var total = AI.engineBytes + AI.modelBytes;
    setInstallState({ installing: true, progress: 0, stage: "Downloading AI grouping...", error: "" });
    try {
      mkdirp(p.dir);
      if (!n.fs.existsSync(p.exe)) {
        var zip = n.path.join(p.dir, "llama.zip");
        await download(AI.engineUrl, zip, AI.engineBytes, function (f) {
          setInstallState({ progress: (f * AI.engineBytes) / total, stage: "Downloading AI engine..." });
        });
        setInstallState({ stage: "Unpacking AI engine..." });
        await extractZip(zip, n.path.join(p.dir, "llama"));
        try {
          n.fs.unlinkSync(zip);
        } catch (e) {}
      }
      if (!isAiInstalled()) {
        await download(AI.modelUrl, p.model, AI.modelBytes, function (f) {
          setInstallState({
            progress: (AI.engineBytes + f * AI.modelBytes) / total,
            stage: "Downloading AI model (" + Math.round(AI.modelBytes / 1e6) + " MB)...",
          });
        });
      }
      if (!isAiInstalled()) throw new Error("The AI files did not install correctly. Try again.");
      setInstallState({ installing: false, progress: 1, stage: "", error: "" });
    } catch (err) {
      setInstallState({ installing: false, progress: 0, stage: "", error: err.message });
      throw err;
    }
  }

  var AI_SYSTEM = [
    "You split a speech transcript into short on-screen captions for a social video.",
    "Rules:",
    "- Keep every word exactly as given, in the same order. Do not add, remove or change words.",
    "- Each caption is a natural unit of meaning: a short sentence, clause or phrase, as a person would say it.",
    "- Start a new caption where a new sentence or thought begins, even when there is no punctuation.",
    '- Keep phrases together, e.g. "what is your name".',
    "- At most MAXWORDS words per caption.",
    "- Never end a caption on words like the, a, my, your, to, of, and.",
    "- A sentence often ends right before words like the, this, that, it, i, we, he, she when they start a new statement: split there.",
    "Examples:",
    "Transcript: i was just kidding the movie is actually great",
    '{"lines": ["i was just kidding", "the movie is actually great"]}',
    "Transcript: we tried it yesterday this place is so good honestly",
    '{"lines": ["we tried it yesterday", "this place is so good honestly"]}',
    "Transcript: can you tell me what time it is",
    '{"lines": ["can you tell me", "what time it is"]}',
    'Answer with JSON: {"lines": ["caption 1", "caption 2", ...]}',
  ].join("\n");
  var AI_SCHEMA = { type: "object", properties: { lines: { type: "array", items: { type: "string" } } }, required: ["lines"] };

  // Word comparison that works for any script: lowercase, punctuation removed.
  function aiToken(t) {
    return String(t || "").toLowerCase().replace(/[.,!?;:"“”‘’()\[\]{}…।॥\-–—]+/g, "").trim();
  }

  function runLlama(words, style) {
    var n = node();
    var p = aiPaths();
    var tmp = n.path.join(n.os.tmpdir(), "leo-ai-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
    mkdirp(tmp);
    var promptFile = n.path.join(tmp, "prompt.txt");
    var schemaFile = n.path.join(tmp, "schema.json");
    var system = AI_SYSTEM.replace("MAXWORDS", String(style.maxWords));
    var text = words.map(function (w) { return w.text; }).join(" ");
    // Qwen chat format with an empty think block, so the model answers directly (fast, no reasoning).
    var prompt = "<|im_start|>system\n" + system + "<|im_end|>\n<|im_start|>user\nTranscript:\n" + text +
      "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n";
    n.fs.writeFileSync(promptFile, prompt, "utf8");
    n.fs.writeFileSync(schemaFile, JSON.stringify(AI_SCHEMA), "utf8");
    var threads = Math.max(1, Math.min(8, (n.os.cpus() || []).length || 4));
    var args = ["-m", p.model, "-f", promptFile, "-no-cnv", "-jf", schemaFile, "-n", String(words.length * 8 + 200),
      "-t", String(threads), "--temp", "0", "--no-display-prompt", "--no-warmup"];
    return new Promise(function (resolve, reject) {
      n.cp.execFile(p.exe, args, { cwd: n.path.dirname(p.exe), windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 180000 },
        function (err, stdout) {
          [promptFile, schemaFile].forEach(function (f) {
            try { n.fs.unlinkSync(f); } catch (e) {}
          });
          try { n.fs.rmdirSync(tmp); } catch (e) {}
          if (err && !stdout) return reject(new Error("AI grouping did not run: " + err.message));
          var out = String(stdout || "");
          try {
            resolve(JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)).lines || []);
          } catch (e) {
            reject(new Error("AI grouping returned no usable answer."));
          }
        });
    });
  }

  // Map the model's caption lines back onto word indices; null if it changed any word.
  function linesToGroups(lines, words, base) {
    var groups = [];
    var i = 0;
    for (var l = 0; l < lines.length; l++) {
      var toks = String(lines[l] || "").split(/\s+/).map(aiToken).filter(Boolean);
      if (!toks.length) continue;
      var first = i;
      for (var t = 0; t < toks.length; t++) {
        while (i < words.length && !aiToken(words[i].text)) i++; // punctuation-only word: attach to this line
        if (i >= words.length || aiToken(words[i].text) !== toks[t]) return null;
        i++;
      }
      groups.push([base + first, base + i - 1]);
    }
    while (i < words.length && !aiToken(words[i].text)) i++;
    if (i !== words.length) return null;
    if (groups.length) groups[groups.length - 1][1] = base + words.length - 1;
    return groups;
  }

  function aiChunkRanges(words) {
    var ranges = [];
    var start = 0;
    while (words.length - start > AI.chunkWords) {
      var best = start + AI.chunkWords, bestScore = -1;
      for (var i = start + Math.floor(AI.chunkWords * 0.6); i < start + AI.chunkWords; i++) {
        var score = (words[i + 1].start - words[i].end) + (/[.!?]["')\]]*$/.test(words[i].text) ? 1 : 0);
        if (score >= bestScore) { bestScore = score; best = i + 1; }
      }
      ranges.push([start, best]);
      start = best;
    }
    ranges.push([start, words.length]);
    return ranges;
  }

  // Groups the words by meaning with the offline model and remembers the plan for segmentLines.
  // Chunks the model breaks (changed words) fall back to the rule-based grouping for that stretch.
  async function groupWithAI(rawWords, styleId, onProgress) {
    var style = CAPTION_STYLES[LEGACY_STYLES[styleId] || styleId] || CAPTION_STYLES[currentStyleId()];
    if (style.single || !isAiInstalled() || !rawWords || !rawWords.length) return null;
    var words = rawWords.map(function (w) {
      return { text: String(w.text).trim(), start: Number(w.start), end: Number(w.end), clean: cleanWord(w.text),
        visible: String(w.text).trim().replace(/[.,!?;:"…]/g, "").length };
    });
    var ranges = aiChunkRanges(words);
    var groups = [];
    for (var r = 0; r < ranges.length; r++) {
      if (onProgress) onProgress(r, ranges.length);
      var a = ranges[r][0], b = ranges[r][1];
      var chunkGroups = null;
      try {
        chunkGroups = linesToGroups(await runLlama(words.slice(a, b), style), words.slice(a, b), a);
      } catch (e) {
        chunkGroups = null;
      }
      if (!chunkGroups) {
        segmentChunk(words, a, b, style).forEach(function (c) { groups.push([c[0], c[1] - 1]); });
        continue;
      }
      // Keep the AI's breaks, but split any caption that is still too long with the offline rules.
      chunkGroups.forEach(function (g) {
        if (g[1] - g[0] + 1 <= style.maxWords) return groups.push(g);
        segmentChunk(words, g[0], g[1] + 1, style).forEach(function (c) { groups.push([c[0], c[1] - 1]); });
      });
    }
    plannedGroups = { key: wordsKey(words, style.id), style: style.id, groups: groups };
    return groups;
  }

  function wordsKey(words, styleId) {
    if (!words || !words.length) return "";
    return [words.length, Number(words[0].start).toFixed(3), Number(words[words.length - 1].end).toFixed(3), styleId].join("|");
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
    setAnimation: setAnimation,
    setCaptionPreset: setCaptionPreset,
    setCleanVoice: setCleanVoice,
    setCaptionStyle: setCaptionStyle,
    installAI: installAI,
    groupWithAI: groupWithAI,
    segmentLines: segmentLines,
    install: install,
    transcribe: transcribe,
    openFolder: openFolder,
    // exposed for testing
    _wordsFromWhisperJson: wordsFromWhisperJson,
    _encodeWav16: encodeWav16,
    _decodeToMono16k: decodeToMono16k,
  };
})();
