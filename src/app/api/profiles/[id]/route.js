import { query, queryOne, execute, withTransaction } from "@/lib/db";
import { handler, ok, readJson, pick, requireId, HttpError } from "@/lib/api-utils";
import { purgeFiles } from "@/lib/attachments";
import { setProfileCookie } from "@/lib/auth";
import { PROFILE_SELECT } from "../route";

async function find(id, ownerId) {
  const row = await queryOne(`${PROFILE_SELECT} WHERE p.id = ? AND p.user_id = ?`, [id, ownerId]);
  if (!row) throw new HttpError("Profile not found.", 404);
  return row;
}

/** { name?, description?, color?, is_default? } */
export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  await find(id, user.owner_id);
  const body = await readJson(request);
  const data = pick(body, ["name", "description", "color"]);
  if (data.name === null) throw new HttpError("Name is required.", 400);
  if (data.name) {
    const dup = await queryOne("SELECT id FROM profiles WHERE user_id = ? AND name = ? AND id <> ?", [user.owner_id, data.name, id]);
    if (dup) throw new HttpError("A profile with that name already exists.", 409);
  }
  await withTransaction(async (conn) => {
    const cols = Object.keys(data);
    if (cols.length) await conn.execute(`UPDATE profiles SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => data[c]), id]);
    if (body.is_default) {
      await conn.execute("UPDATE profiles SET is_default = 0 WHERE user_id = ?", [user.owner_id]);
      await conn.execute("UPDATE profiles SET is_default = 1 WHERE id = ?", [id]);
    }
  });
  return ok(await find(id, user.owner_id));
});

/** Deletes the profile and everything inside it. The last profile cannot be deleted. */
export const DELETE = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  const profile = await find(id, user.owner_id);
  const [{ n }] = await query("SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?", [user.owner_id]);
  if (n <= 1) throw new HttpError("You need at least one profile.", 400);
  await purgeFiles("task", "p.profile_id = ?", [id]);
  await purgeFiles("requirement", "p.profile_id = ?", [id]);
  await execute("DELETE FROM profiles WHERE id = ?", [id]);
  if (profile.is_default) {
    await execute("UPDATE profiles SET is_default = 1 WHERE user_id = ? ORDER BY id LIMIT 1", [user.owner_id]);
  }
  if (user.profile_id === id) await setProfileCookie(null); // fall back to the default profile
  return ok({ id });
});
