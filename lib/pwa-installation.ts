const INSTALLED_STORAGE_KEY = "schach-plattform-installed-v1";

export function isAppInstalled(): boolean {
  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));

  try {
    return standalone || window.localStorage.getItem(INSTALLED_STORAGE_KEY) === "true";
  } catch {
    return standalone;
  }
}

export function markAppInstalled(): void {
  try {
    window.localStorage.setItem(INSTALLED_STORAGE_KEY, "true");
  } catch {
    // Standalone display-mode detection remains available if storage is disabled.
  }
  window.dispatchEvent(new Event("pwa-installed"));
}
