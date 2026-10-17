import "./style.css";

const appStatus = document.querySelector<HTMLParagraphElement>("#app-status");

if (appStatus) {
  appStatus.textContent = "Manifest Scanner is ready.";
}
