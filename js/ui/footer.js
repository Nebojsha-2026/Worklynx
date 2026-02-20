// js/ui/footer.js
import { path } from "../core/config.js";

export function renderFooter({ version = "v0.1.0" } = {}) {
  const footer = document.createElement("footer");
  footer.className = "wl-footer";

  footer.innerHTML = `
    <div class="wl-footer__inner">
      <div class="wl-footer__col">
        <h4>WorkLynx</h4>
        <div>Modern timesheets & shift management.</div>
      </div>

      <div class="wl-footer__col">
        <h4>Support</h4>
        <a href="mailto:support@worklynx.io">Contact Support</a>
      </div>

      <div class="wl-footer__col">
        <h4>Legal</h4>
        <a href="${path("/index.html#privacy")}">Privacy Policy</a>
        <a href="${path("/index.html#terms")}">Terms of Service</a>
      </div>

      <div class="wl-footer__col">
        <h4>Meta</h4>
        <div>Built by Nebojsha</div>
        <div>Version: ${version}</div>
      </div>
    </div>
  `;

  return footer;
}
