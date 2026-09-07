import { HttpError } from "./http-error";
import { FORMATS, parseTableJson, serializeTable } from "./text-tables";

/**
 * Validates { title?, content?, format? } for an output / note block.
 * Table blocks must carry well-formed JSON ({ columns, rows }); it is re-serialised in normalised form.
 */
export function blockPatch(body, current = null) {
  const sets = {};
  if (typeof body.title === "string") sets.title = body.title.trim().slice(0, 200);
  if (body.format !== undefined) {
    if (!FORMATS.includes(body.format)) throw new HttpError(`format must be one of: ${FORMATS.join(", ")}.`, 400);
    sets.format = body.format;
  }
  const format = sets.format ?? current?.format ?? "text";
  if (body.content !== undefined) {
    if (format === "table") {
      const table = parseTableJson(typeof body.content === "string" ? body.content : JSON.stringify(body.content));
      if (!table) throw new HttpError("A table block needs content like { columns: [..], rows: [[..]] }.", 400);
      sets.content = serializeTable(table);
    } else sets.content = body.content == null ? null : String(body.content);
  } else if (sets.format === "table" && current && !parseTableJson(current.content)) {
    throw new HttpError("Send table content when switching a block to the table format.", 400);
  }
  return sets;
}
