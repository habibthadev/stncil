import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "stncil";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const engine = new Engine({ debug: false });

function readTemplate(name) {
  return fs.readFileSync(path.join(__dirname, name), "utf-8");
}

const templates = {
  welcome: readTemplate("views/welcome.stn"),
  notification: readTemplate("views/notification.stn"),
};

export async function renderWelcomeEmail(user, siteName, dashboardUrl) {
  return engine.compileAndRender(
    templates.welcome,
    {
      user,
      site_name: siteName,
      dashboard_url: dashboardUrl,
      year: new Date().getFullYear(),
    },
    { sourceFile: path.join(__dirname, "views/welcome.stn") },
  );
}

export async function renderNotification(notification) {
  return engine.compileAndRender(templates.notification, notification, {
    sourceFile: path.join(__dirname, "views/notification.stn"),
  });
}

// Run as script to send demo output
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log("=== Welcome Email ===");
  const welcomeResult = await renderWelcomeEmail(
    {
      name: "Jane Doe",
      email: "jane@example.com",
      plan: "premium",
      joined_at: new Date("2026-06-24"),
    },
    "MyApp",
    "https://myapp.com/dashboard",
  );
  if (welcomeResult.errors.length > 0) {
    console.error("Errors:", welcomeResult.errors);
    process.exitCode = 1;
  }
  if (!welcomeResult.errors.length) console.log(welcomeResult.html);
  console.log("\n");

  console.log("=== Notification ===");
  const notifResult = await renderNotification({
    subject: "Your report is ready",
    type: "info",
    message: "The weekly analytics report has been generated and is ready for review.",
    timestamp: new Date("2026-06-25T14:30:00"),
    details: [
      { label: "Report Period", value: "Jun 18 – Jun 24" },
      { label: "Total Views", value: "14,283" },
      { label: "New Users", value: "342" },
      { label: "Revenue", value: "$2,847.50" },
    ],
    action_url: "https://myapp.com/reports/weekly",
    action_label: "View Report",
  });
  if (notifResult.errors.length > 0) {
    console.error("Errors:", notifResult.errors);
    process.exitCode = 1;
  }
  if (!notifResult.errors.length) console.log(notifResult.html);
}
