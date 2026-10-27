import type { Vehicle } from "../../web/src/types";

const COLUMNS = "id, make, model, year, status, version";

// every query is scoped by dealership_id
export async function listVehicles(db: D1Database, dealershipId: number) {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM vehicles WHERE dealership_id = ? ORDER BY id`)
    .bind(dealershipId)
    .all<Vehicle>();
  return results;
}

export async function findVehicle(db: D1Database, id: number, dealershipId: number) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM vehicles WHERE id = ? AND dealership_id = ?`)
    .bind(id, dealershipId)
    .first<Vehicle>();
}

// DEFECTIVE DEMO (branch lost-update-bug, never deployed): read, compare in code, then write with no
// version condition. Two editors holding the same version both pass the check, and the later write wins.
export async function updateVehicle(
  db: D1Database,
  id: number,
  dealershipId: number,
  version: number,
  edit: Pick<Vehicle, "make" | "model" | "year" | "status">,
) {
  const { make, model, year, status } = edit;

  const row = await findVehicle(db, id, dealershipId);
  if (!row || row.version !== version) return null;

  return db
    .prepare(
      `UPDATE vehicles SET make = ?, model = ?, year = ?, status = ?, version = version + 1
       WHERE id = ? AND dealership_id = ?
       RETURNING ${COLUMNS}`,
    )
    .bind(make, model, year, status, id, dealershipId)
    .first<Vehicle>();
}
