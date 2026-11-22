const dialog = document.getElementById("delete-dialog");
let pendingDeleteId = null;

function setTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector("#theme-icon use")
    .setAttribute("href", `/icons.svg#${dark ? "sun" : "moon"}`);
  const toggle = document.getElementById("theme-toggle");
  toggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} theme`);
  toggle.setAttribute("aria-pressed", String(dark));
}

try {
  setTheme(localStorage.getItem("theme"));
} catch {
  setTheme("light");
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  const label = document.createElement("span");
  label.textContent = message;
  toast.appendChild(label);
  const container = document.getElementById("toast-container");
  container.replaceChildren(toast);
  setTimeout(() => toast.remove(), 5000);
}

function closeDialog() {
  pendingDeleteId = null;
  dialog.close();
}

dialog.addEventListener("cancel", () => {
  pendingDeleteId = null;
});

document.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    try {
      await navigator.clipboard.writeText(`${location.origin}/${copy.dataset.copy}`);
      showToast(`Copied /${copy.dataset.copy}`);
    } catch {
      showToast("Could not copy. Select the short link to copy it manually.");
    }
    return;
  }
  const remove = event.target.closest("[data-delete]");
  if (remove) {
    pendingDeleteId = remove.dataset.delete;
    document.getElementById("delete-link-label").textContent = remove.dataset.label;
    dialog.showModal();
    return;
  }
  if (event.target.closest("#theme-toggle")) {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(theme);
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* Storage can be disabled in private browsing. */
    }
    return;
  }
  if (event.target.closest("#dialog-cancel")) closeDialog();
  if (event.target.closest("#dialog-confirm") && /^\d+$/.test(pendingDeleteId ?? "")) {
    const token = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!token) {
      showToast("Reload the page before deleting this link.");
      return;
    }
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `/links/${pendingDeleteId}/delete`;
    const field = document.createElement("input");
    field.type = "hidden";
    field.name = "_csrf";
    field.value = token;
    form.appendChild(field);
    document.body.appendChild(form);
    form.submit();
    closeDialog();
  }
});

function isValidUrl(value) {
  if (!value || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const parsed = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function fieldError(field, message) {
  const error = document.createElement("p");
  error.className = "field-error";
  error.id = `${field.id}-error`;
  error.textContent = message;
  field.classList.add("invalid");
  field.setAttribute("aria-invalid", "true");
  if (!Object.hasOwn(field.dataset, "description"))
    field.dataset.description = field.getAttribute("aria-describedby") ?? "";
  field.setAttribute(
    "aria-describedby",
    [field.dataset.description, error.id].filter(Boolean).join(" "),
  );
  field.closest(".field").appendChild(error);
  const details = field.closest("details");
  if (details) details.open = true;
}

function validate(form) {
  for (const error of form.querySelectorAll(".field-error")) error.remove();
  for (const field of form.querySelectorAll(".invalid")) {
    field.classList.remove("invalid");
    field.removeAttribute("aria-invalid");
    if (field.dataset.description)
      field.setAttribute("aria-describedby", field.dataset.description);
    else field.removeAttribute("aria-describedby");
  }
  const url = form.elements.url;
  if (!isValidUrl(url.value.trim()))
    fieldError(url, "Enter an HTTP or HTTPS URL without credentials.");
  const slug = form.elements.slug;
  if (slug && !slug.readOnly) {
    slug.value = slug.value.trim().toLowerCase();
    if (slug.value && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug.value))
      fieldError(slug, "Use up to 64 letters, numbers, or hyphens. Start with a letter or number.");
  }
  const title = form.elements.title;
  if (title && title.value.trim().length > 240)
    fieldError(title, "Use a label of at most 240 characters.");
  const first = form.querySelector(".invalid");
  if (first) first.focus();
  return !first;
}

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (form instanceof HTMLFormElement && form.matches("[data-validate]")) {
    if (!validate(form)) event.preventDefault();
  }
});

document
  .getElementById("sort")
  ?.addEventListener("change", (event) => event.target.form.requestSubmit());
