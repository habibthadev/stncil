(function() {
  var theme = localStorage.getItem("theme");
  if (!theme) {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
  var icon = document.getElementById("theme-icon");
  if (icon) icon.setAttribute("icon", "hugeicons:" + (theme === "dark" ? "moon-01" : "sun-01"));
})();

document.addEventListener("click", function(e) {
  var target = e.target.closest("[data-copy]");
  if (target) {
    var slug = target.getAttribute("data-copy");
    var url = window.location.origin + "/" + slug;
    navigator.clipboard.writeText(url).then(function() {
      showToast("Copied: " + url, "success");
    });
    return;
  }

  target = e.target.closest("[data-delete]");
  if (target) {
    pendingDeleteId = target.getAttribute("data-delete");
    var dialog = document.getElementById("delete-dialog");
    if (dialog) dialog.showModal();
    return;
  }

  target = e.target.closest("#theme-toggle");
  if (target) {
    toggleTheme();
    return;
  }

  target = e.target.closest("#dialog-cancel");
  if (target) {
    closeDialog();
    return;
  }

  target = e.target.closest("#dialog-confirm");
  if (target) {
    confirmDelete();
    return;
  }
});

function toggleTheme() {
  var html = document.documentElement;
  var current = html.getAttribute("data-theme");
  var next = current === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  var icon = document.getElementById("theme-icon");
  if (icon) {
    icon.style.transform = "rotate(360deg)";
    setTimeout(function() {
      icon.setAttribute("icon", "hugeicons:" + (next === "dark" ? "moon-01" : "sun-01"));
      icon.style.transform = "";
    }, 150);
  }
}

function showToast(message, type) {
  type = type || "info";
  var container = document.getElementById("toast-container");
  var toast = document.createElement("div");
  toast.className = "toast toast-" + type;
  var iconName = "information-circle";
  if (type === "success") iconName = "checkmark-circle-01";
  else if (type === "error") iconName = "alert-circle";
  else if (type === "warning") iconName = "alert-01";
  toast.innerHTML = '<iconify-icon icon="hugeicons:' + iconName + '"></iconify-icon><span>' + message + '</span>';
  container.appendChild(toast);
  setTimeout(function() { toast.classList.add("visible"); }, 10);
  setTimeout(function() {
    toast.classList.remove("visible");
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

var pendingDeleteId = null;

function closeDialog() {
  pendingDeleteId = null;
  var dialog = document.getElementById("delete-dialog");
  if (dialog) dialog.close();
}

function confirmDelete() {
  if (pendingDeleteId) {
    var form = document.createElement("form");
    form.method = "POST";
    form.action = "/links/" + pendingDeleteId + "/delete";
    document.body.appendChild(form);
    form.submit();
  }
  closeDialog();
}

document.addEventListener("submit", function(e) {
  var form = e.target;
  if (form.matches("[data-validate='link']")) {
    if (!validateLinkForm(form)) e.preventDefault();
  } else if (form.matches("[data-validate='edit']")) {
    if (!validateEditForm(form)) e.preventDefault();
  }
});

function validateLinkForm(form) {
  var url = form.querySelector('[name="url"]');
  var slug = form.querySelector('[name="slug"]');
  clearErrors(form);

  var valid = true;

  if (!url.value.trim()) {
    showFieldError(url, "Enter a destination URL");
    valid = false;
  } else if (!isValidUrl(url.value.trim())) {
    showFieldError(url, "Enter a valid URL");
    valid = false;
  }

  if (slug.value.trim() && !/^[a-z0-9][a-z0-9-]*$/.test(slug.value.trim())) {
    showFieldError(slug, "Letters, numbers, and hyphens only");
    valid = false;
  }

  if (!valid) {
    var firstInvalid = form.querySelector(".invalid");
    if (firstInvalid) firstInvalid.focus();
  }

  return valid;
}

function validateEditForm(form) {
  var url = form.querySelector('[name="url"]');
  clearErrors(form);

  var valid = true;

  if (!url.value.trim()) {
    showFieldError(url, "Enter a destination URL");
    valid = false;
  } else if (!isValidUrl(url.value.trim())) {
    showFieldError(url, "Enter a valid URL");
    valid = false;
  }

  if (!valid) {
    var firstInvalid = form.querySelector(".invalid");
    if (firstInvalid) firstInvalid.focus();
  }

  return valid;
}

function isValidUrl(str) {
  if (/^https?:\/\//i.test(str)) return true;
  if (/^[a-zA-Z0-9]/.test(str) && /\.[a-zA-Z]{2,}/.test(str)) return true;
  return false;
}

function showFieldError(field, msg) {
  field.classList.add("invalid");
  var error = document.createElement("div");
  error.className = "field-error";
  error.innerHTML = '<iconify-icon icon="hugeicons:alert-circle"></iconify-icon>' + msg;
  field.parentNode.appendChild(error);
}

function clearErrors(form) {
  var errors = form.querySelectorAll(".field-error");
  errors.forEach(function(e) { e.remove(); });
  var invalids = form.querySelectorAll(".invalid");
  invalids.forEach(function(e) { e.classList.remove("invalid"); });
}
