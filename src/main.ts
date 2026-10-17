import "./style.css";
import { registerSW } from "virtual:pwa-register";

const appStatus = document.querySelector<HTMLParagraphElement>("#app-status");

if (appStatus) {
  appStatus.textContent = "Manifest Scanner is ready.";
}

registerSW({
  immediate: true,

  onOfflineReady() {
    if (appStatus) {
      appStatus.textContent = "App is ready to work offline.";
    }
  },

  onNeedRefresh() {
    if (appStatus) {
      appStatus.textContent = "An update is available. Reload to apply it.";
    }
  },
});
