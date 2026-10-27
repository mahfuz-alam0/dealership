import { useEffect, useState } from "react";
import AppHeader from "../components/AppHeader";
import Button from "../components/Button";
import EditVehicleForm from "../components/EditVehicleForm";
import Modal from "../components/Modal";
import Notice, { type Kind } from "../components/Notice";
import StatTabs, { type Filter } from "../components/StatTabs";
import Toolbar, { type View } from "../components/Toolbar";
import VehicleCards from "../components/VehicleCards";
import VehicleTable from "../components/VehicleTable";
import { logout as apiLogout } from "../services/auth";
import { listVehicles } from "../services/vehicles";
import type { Sort, SortKey, User, Vehicle } from "../types";

interface InventoryPageProps {
  user: User;
  onLogout: () => void;
}

export default function InventoryPage({ user, onLogout }: InventoryPageProps) {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [top, setTop] = useState<{ kind: Kind; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort | null>(null);
  const [view, setView] = useState<View>("table");
  const isAdmin = user.role === "admin"; // UX only; the API enforces permissions

  const load = () => {
    setLoadError("");
    setVehicles(null);
    listVehicles().then(setVehicles, (error: Error) => setLoadError(error.message));
  };

  useEffect(load, []);

  // swap the saved vehicle back into the list instead of refetching everything.
  const replaceVehicle = (updated: Vehicle) => {
    setVehicles((current) => (current ? current.map((vehicle) => (vehicle.id === updated.id ? updated : vehicle)) : current));
  };

  const editing = vehicles?.find((vehicle) => vehicle.id === editId);

  // Stay signed in on failure: the server session would still be alive after a reload.
  const logout = () => {
    apiLogout().then(onLogout, (error: Error) => setTop({ kind: "error", text: error.message }));
  };

  const search = query.trim().toLowerCase();
  const shown = (vehicles ?? []).filter((vehicle) => {
    const matchesFilter = filter === "all" || vehicle.status === filter;
    const matchesSearch = `${vehicle.make} ${vehicle.model}`.toLowerCase().includes(search);
    return matchesFilter && matchesSearch;
  });

  // numeric collation keeps the year and version columns in the right order.
  if (sort) {
    shown.sort((a, b) => sort.dir * String(a[sort.key]).localeCompare(String(b[sort.key]), undefined, { numeric: true }));
  }

  const toggleSort = (key: SortKey) => {
    setSort((current) => (current?.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  };

  const onEdit = isAdmin
    ? (vehicle: Vehicle) => {
        setTop(null);
        setEditId(vehicle.id);
      }
    : undefined;

  const clearFilters = () => {
    setQuery("");
    setFilter("all");
  };

  return (
    <>
      <AppHeader user={user} onLogout={logout} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vehicle inventory</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          {isAdmin ? "Review stock and edit vehicle details." : "Read-only view of current stock."}
        </p>
        {top && <Notice kind={top.kind}>{top.text}</Notice>}
        {editing && (
          <Modal onClose={() => setEditId(null)}>
            <EditVehicleForm
              key={editing.id}
              vehicle={editing}
              onRefreshed={replaceVehicle}
              onSaved={(saved) => {
                replaceVehicle(saved);
                setEditId(null);
                setTop({ kind: "success", text: `Saved ${saved.make} ${saved.model} (now version ${saved.version}).` });
                setFlashId(saved.id);
                setTimeout(() => setFlashId(null), 1800);
              }}
              onCancel={() => setEditId(null)}
            />
          </Modal>
        )}
        {loadError ? (
          <Notice kind="error">
            {loadError}{" "}
            <Button className="ml-3" onClick={load}>
              Retry
            </Button>
          </Notice>
        ) : !vehicles ? (
          <p role="status" className="flex items-center justify-center gap-3 py-12 text-slate-500">
            <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
            Loading vehicles…
          </p>
        ) : vehicles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-slate-500">No vehicles in stock.</p>
        ) : (
          <>
            <StatTabs vehicles={vehicles} value={filter} onChange={setFilter} />
            <Toolbar query={query} onQuery={setQuery} view={view} onView={setView} shown={shown.length} total={vehicles.length} />
            {shown.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-slate-500">
                <p>No vehicles match your filters.</p>
                <Button className="mt-3" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            ) : view === "table" ? (
              <VehicleTable
                vehicles={shown}
                dealership={user.dealership}
                sort={sort}
                onSort={toggleSort}
                flashId={flashId}
                onEdit={onEdit}
              />
            ) : (
              <VehicleCards vehicles={shown} flashId={flashId} onEdit={onEdit} />
            )}
          </>
        )}
      </main>
    </>
  );
}
