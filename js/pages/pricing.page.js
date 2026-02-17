// js/pages/pricing.page.js - READY TO USE!
import { getSession } from "../core/session.js";
import { path } from "../core/config.js";
import { createOrganization } from "../data/orgs.api.js";
import { getTierDetails, createCheckoutSession } from "../data/stripe.api.js";
import { getSupabase } from "../core/supabaseClient.js";

const session = await getSession();
if (!session?.user) {
  window.location.replace(path("/login.html"));
}

// Check if user already has an organization
const supabase = getSupabase();
const { data: existingOrg } = await supabase
  .from("org_members")
  .select("organization_id")
  .eq("user_id", session.user.id)
  .eq("is_active", true)
  .limit(1)
  .maybeSingle();

if (existingOrg?.organization_id) {
  window.location.replace(path("/app/bo/dashboard.html"));
}

// Check if user canceled checkout
const params = new URLSearchParams(window.location.search);
const wasCanceled = params.get("canceled") === "true";

// Render pricing page
document.body.innerHTML = `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { text-align: center; color: white; margin-bottom: 60px; }
    .header h1 { font-size: 3rem; margin-bottom: 20px; font-weight: 800; }
    .header p { font-size: 1.25rem; opacity: 0.9; }
    .company-section {
      max-width: 500px; margin: 0 auto 40px; background: white;
      padding: 30px; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .company-section h2 { margin-bottom: 20px; color: #1a1a1a; }
    .company-section input {
      width: 100%; padding: 15px; border: 2px solid #e0e0e0;
      border-radius: 12px; font-size: 1rem; transition: border-color 0.3s;
    }
    .company-section input:focus {
      outline: none; border-color: #667eea;
    }
    .grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 30px; margin-bottom: 40px;
    }
    .card {
      background: white; border-radius: 20px; padding: 40px 30px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      transition: transform 0.3s, box-shadow 0.3s; position: relative;
    }
    .card:hover { transform: translateY(-10px); box-shadow: 0 30px 80px rgba(0,0,0,0.4); }
    .card.featured { border: 3px solid #667eea; transform: scale(1.05); }
    .card.featured::before {
      content: "MOST POPULAR"; position: absolute; top: -15px; left: 50%;
      transform: translateX(-50%); background: #667eea; color: white;
      padding: 5px 20px; border-radius: 20px; font-size: 12px;
      font-weight: 700; letter-spacing: 1px;
    }
    .tier-name { font-size: 1.5rem; font-weight: 700; margin-bottom: 10px; }
    .tier-price { font-size: 3rem; font-weight: 800; color: #667eea; margin-bottom: 10px; }
    .tier-price small { font-size: 1rem; color: #666; font-weight: 400; }
    .tier-desc { color: #666; margin-bottom: 30px; }
    .features { list-style: none; margin-bottom: 30px; }
    .features li {
      padding: 10px 0; display: flex; align-items: flex-start; gap: 10px;
    }
    .features li::before {
      content: "✓"; color: #667eea; font-weight: 700; font-size: 1.2rem;
    }
    .btn {
      width: 100%; padding: 15px; background: #667eea; color: white;
      border: none; border-radius: 12px; font-size: 1rem; font-weight: 700;
      cursor: pointer; transition: all 0.3s;
    }
    .btn:hover {
      background: #5568d3; transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
    }
    .btn:disabled { background: #ccc; cursor: not-allowed; transform: none; }
    .enterprise { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .enterprise .tier-name, .enterprise .tier-price,
    .enterprise .tier-desc, .enterprise .features li { color: white; }
    .enterprise .features li::before { color: white; }
    .enterprise .btn { background: white; color: #667eea; }
    .enterprise .btn:hover { background: #f0f0f0; }
    .message {
      max-width: 600px; margin: 20px auto; padding: 15px 20px;
      border-radius: 12px; text-align: center; font-weight: 500;
    }
    .message.error { background: #fee; color: #c33; border: 2px solid #fcc; }
    .message.success { background: #efe; color: #3a3; border: 2px solid #cfc; }
    .message.info { background: #ffeeb3; color: #856404; border: 2px solid #ffd966; }
  </style>

  <div class="container">
    <div class="header">
      <h1>Choose Your Plan</h1>
      <p>Start managing timesheets and shifts for your team. 14-day free trial included!</p>
    </div>

    <div class="company-section">
      <h2>Company Name</h2>
      <input id="companyName" type="text" placeholder="Enter your company name" required autofocus />
    </div>

    ${wasCanceled ? '<div id="message" class="message info">Payment canceled. Choose a plan to continue.</div>' : '<div id="message" class="message" style="display:none;"></div>'}

    <div class="grid" id="grid"></div>
  </div>
`;

const messageEl = document.getElementById("message");
const companyInput = document.getElementById("companyName");
const grid = document.getElementById("grid");

function showMessage(text, type = "info") {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.style.display = "block";
}

function hideMessage() {
  messageEl.style.display = "none";
}

// Render pricing cards
const tiers = ["tier_1", "tier_2", "tier_3", "tier_4_custom"];
tiers.forEach((tier) => {
  const details = getTierDetails(tier);
  const featured = tier === "tier_2";
  const enterprise = tier === "tier_4_custom";

  const card = document.createElement("div");
  card.className = `card ${featured ? "featured" : ""} ${enterprise ? "enterprise" : ""}`;
  
  const priceDisplay = details.price 
    ? `$${details.price}<small>/month</small>` 
    : `<small style="font-size:1.5rem;">Contact Us</small>`;

  card.innerHTML = `
    <div class="tier-name">${details.name}</div>
    <div class="tier-price">${priceDisplay}</div>
    <div class="tier-desc">Up to ${details.maxEmployees} employees</div>
    <ul class="features">
      ${details.features.map(f => `<li>${f}</li>`).join("")}
    </ul>
    <button class="btn" data-tier="${tier}" ${enterprise ? 'data-enterprise="true"' : ''}>
      ${enterprise ? 'Contact Sales' : 'Select Plan'}
    </button>
  `;

  grid.appendChild(card);
});

// Handle plan selection
grid.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn");
  if (!btn) return;

  const tier = btn.getAttribute("data-tier");
  const enterprise = btn.getAttribute("data-enterprise") === "true";

  if (enterprise) {
    showMessage("Contact us at sales@worklynx.com for enterprise pricing.", "info");
    return;
  }

  const companyName = companyInput.value.trim();
  if (!companyName) {
    showMessage("Please enter your company name first.", "error");
    companyInput.focus();
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = "Creating organization...";
    hideMessage();

    const org = await createOrganization({ name: companyName });
    
    await supabase
      .from("organizations")
      .update({ subscription_tier: tier, subscription_status: "incomplete" })
      .eq("id", org.id);

    btn.textContent = "Redirecting to payment...";
    await createCheckoutSession({ tier, orgId: org.id, orgName: companyName });

  } catch (err) {
    console.error(err);
    showMessage(err.message || "Failed to start checkout. Please try again.", "error");
    btn.disabled = false;
    btn.textContent = "Select Plan";
  }
});

companyInput.addEventListener("input", hideMessage);
