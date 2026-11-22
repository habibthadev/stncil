const dialog = document.getElementById("task-delete-dialog");
let pendingForm = null;

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-delete-task")) return;
  if (form.dataset.confirmed === "true") return;
  event.preventDefault();
  pendingForm = form;
  document.getElementById("task-delete-label").textContent = form.dataset.deleteTask;
  dialog.showModal();
});

dialog.addEventListener("cancel", () => {
  pendingForm = null;
});
document.getElementById("task-keep").addEventListener("click", () => {
  pendingForm = null;
  dialog.close();
});
document.getElementById("task-delete").addEventListener("click", () => {
  if (!pendingForm) return;
  pendingForm.dataset.confirmed = "true";
  pendingForm.requestSubmit();
  pendingForm = null;
  dialog.close();
});
