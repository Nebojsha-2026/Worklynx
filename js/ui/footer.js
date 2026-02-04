// js/ui/footer.js
export function renderFooter({ version = "v0.1.0" } = {}) {
  const el = document.createElement("footer");
  el.className = "wl-footer";

  el.innerHTML = `
    <div class="wl-footer__grid">
      <div>
        <div class="wl-footer__title">WorkLynx</div>
        <div class="wl-footer__text">Modern timesheets & shift management.</div>
      </div>

      <div>
        <div class="wl-footer__title">Support</div>
        <a class="wl-footer__link" href="#">Contact Support</a><br />
        <a class="wl-footer__link" href="#">System Status</a>
      </div>

      <div>
        <div class="wl-footer__title">Product</div>
        <a class="wl-footer__link" href="#">Changelog</a><br />
        <a class="wl-footer__link" href="#">Maintenance Schedule</a>
      </div>

      <div>
        <div class="wl-footer__title">Meta</div>
        <div class="wl-footer__text">Built by Nebojsha</div>
        <div class="wl-footer__text">Version: ${version}</div>
      </div>
    </div>
  `;

  return el;
}

