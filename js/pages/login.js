import { login } from "../core/auth.js";

document.querySelector("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = email.value;
  const password = password.value;

  const { error } = await login(email, password);
  if (error) return alert(error.message);

  window.location.href = "/manager.html";
});
