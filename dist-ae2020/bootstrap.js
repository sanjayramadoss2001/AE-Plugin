(function () {
  var base = window.__DRIPZ_BOOT_BASE__ || "./";
  var root = document.getElementById("root");
  var fallback = document.getElementById("boot-fallback");
  var bootTimedOut = false;

  function setFallback(message) {
    if (!fallback) {
      return;
    }
    fallback.textContent = message;
  }

  function showBootError(message) {
    if (!root) {
      return;
    }
    if (!fallback) {
      fallback = document.createElement("div");
      fallback.id = "boot-fallback";
      fallback.style.minHeight = "100vh";
      fallback.style.display = "flex";
      fallback.style.alignItems = "center";
      fallback.style.justifyContent = "center";
      fallback.style.background = "#14131d";
      fallback.style.color = "#ff8f8f";
      fallback.style.fontFamily = "'Courier New', monospace";
      fallback.style.fontSize = "13px";
      fallback.style.letterSpacing = ".03em";
      fallback.style.textAlign = "center";
      fallback.style.padding = "24px";
      root.innerHTML = "";
      root.appendChild(fallback);
    }
    fallback.textContent = message;
  }

  window.__DRIPZ_APP_READY__ = false;
  setFallback("Loading AE Layer Tools bootstrap...");

  window.addEventListener("error", function (event) {
    var message = event && event.message ? event.message : "Unknown boot error";
    showBootError("AE Layer Tools failed: " + message);
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    var message = "Unknown promise rejection";
    if (typeof reason === "string") {
      message = reason;
    } else if (reason && reason.message) {
      message = reason.message;
    }
    showBootError("AE Layer Tools failed: " + message);
  });

  setTimeout(function () {
    if (window.__DRIPZ_APP_READY__) {
      return;
    }
    bootTimedOut = true;
    showBootError("AE Layer Tools bundle is still loading. Check " + base + "assets/index.js.");
  }, 6000);

  var script = document.createElement("script");
  script.src = base + "assets/index.js";
  script.async = false;
  script.onload = function () {
    if (window.__DRIPZ_APP_READY__) {
      return;
    }
    if (!bootTimedOut) {
      setFallback("Starting AE Layer Tools...");
    }
  };
  script.onerror = function () {
    showBootError("Could not load " + base + "assets/index.js");
  };
  document.body.appendChild(script);
})();
