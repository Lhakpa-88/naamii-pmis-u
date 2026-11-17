import { canEnterData } from "@naamii/core";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { buildTemplate } from "@/lib/entry/template";

/** Download the Excel data-entry template for the signed-in user's role (?data=1 fills in current records). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!canEnterData(user.role)) return new Response("Your role cannot enter data.", { status: 403 });

  const withData = new URL(request.url).searchParams.get("data") === "1";
  const file = await withUser(user.id, (q) => buildTemplate(q, user, withData));
  const name = `NAAMII-PMIS-${user.role === "admin" ? "finance" : "project"}-${withData ? "data" : "template"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
