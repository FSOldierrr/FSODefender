(function () {
  try {
    var stored = localStorage.getItem("fsod.theme") || "dark";
    var dark =
      stored === "dark" ||
      (stored === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch (_) {
    /* Depolama kullanılamıyorsa varsayılan koyu tema uygulanır. */
  }
})();
