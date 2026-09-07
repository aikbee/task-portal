import { queryOne } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { setWorkspaceCookie, getSessionUser } from "@/lib/auth";

/** Admin only: { user_id } switches into that user's workspace; { user_id: null } returns to your own. */
export const PUT = handler(
  async (request, _params, me) => {
    const body = await readJson(request);
    const target = body.user_id == null || body.user_id === "" ? null : Number(body.user_id);
    if (target !== null) {
      if (!Number.isInteger(target) || target <= 0) throw new HttpError("Invalid user id.", 400);
      if (target === me.id) {
        await setWorkspaceCookie(null);
      } else {
        const exists = await queryOne("SELECT id FROM users WHERE id = ?", [target]);
        if (!exists) throw new HttpError("User not found.", 404);
        await setWorkspaceCookie(target);
      }
    } else {
      await setWorkspaceCookie(null);
    }
    const fresh = await getSessionUser(request);
    // cookies() changes are not visible on `request`, so report the intended workspace explicitly
    const ws = target && target !== me.id ? await queryOne("SELECT id, name, email, role, avatar_color FROM users WHERE id = ?", [target]) : null;
    const { session_id, expires_at, ...safe } = fresh ?? me;
    return ok({ ...safe, owner_id: ws ? ws.id : me.id, workspace: ws });
  },
  { role: "admin" }
);
