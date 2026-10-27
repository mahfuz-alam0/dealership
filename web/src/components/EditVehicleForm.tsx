import { useState, type ChangeEvent, type FormEvent } from "react";
import type { ApiError } from "../services/handleApiError";
import { getVehicle, updateVehicle, type VehicleEdit } from "../services/vehicles";
import { STATUSES, type Vehicle } from "../types";
import Button from "./Button";
import Field, { controlClass } from "./Field";
import Notice, { type Kind } from "./Notice";

function toFormValues(vehicle: Vehicle) {
  return {
    make: vehicle.make,
    model: vehicle.model,
    year: String(vehicle.year),
    status: vehicle.status as string,
  };
}

type FormValues = ReturnType<typeof toFormValues>;

interface Props {
  vehicle: Vehicle;
  onSaved: (vehicle: Vehicle) => void;
  onRefreshed: (vehicle: Vehicle) => void;
  onCancel: () => void;
}

export default function EditVehicleForm({ vehicle, onSaved, onRefreshed, onCancel }: Props) {
  const [values, setValues] = useState(toFormValues(vehicle));
  const [msg, setMsg] = useState<{ kind: Kind; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);

  const initialValues = toFormValues(vehicle);
  const isDirty = (Object.keys(initialValues) as (keyof FormValues)[]).some(
    (key) => initialValues[key] !== values[key],
  );

  const fieldProps = (name: keyof FormValues) => {
    const fieldError = fields[name];

    return {
      id: name,
      name,
      value: values[name],
      required: true,
      className: controlClass,
      "aria-invalid": Boolean(fieldError),
      "aria-describedby": fieldError ? `${name}-error` : undefined,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setValues((current) => ({ ...current, [name]: event.target.value }));
      },
    };
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMsg(null);
    setFields({});

    try {
      // Always send the version we loaded; the server rejects with 409 if it moved on.
      const edit: VehicleEdit = {
        ...values,
        year: Number(values.year),
        status: values.status as Vehicle["status"],
        version: vehicle.version,
      };
      onSaved(await updateVehicle(vehicle.id, edit));
    } catch (error) {
      const apiError = error as ApiError;
      setConflict(apiError.status === 409);
      setFields(apiError.fields ?? {});
      setMsg({ kind: "error", text: apiError.message });
      setBusy(false);
    }
  }

  // Explicit user action only: load current server values and reset the form to them. Never retries the save.
  async function refresh() {
    setBusy(true);
    try {
      const latest = await getVehicle(vehicle.id);
      onRefreshed(latest);
      setValues(toFormValues(latest));
      setFields({});
      setConflict(false);
      setMsg({ kind: "info", text: "Showing the latest values. Review them and save again if you still want to change this vehicle." });
    } catch (error) {
      setMsg({ kind: "error", text: (error as Error).message });
    }
    setBusy(false);
  }

  return (
    <form className="p-6" onSubmit={save}>
      <h2 className="mb-5 text-lg font-semibold tracking-tight text-slate-900">
        Edit {vehicle.make} {vehicle.model} <small className="font-normal text-slate-500">(version {vehicle.version})</small>
      </h2>
      {msg && (
        <Notice kind={msg.kind}>
          {msg.text}
          {conflict && (
            <Button type="button" className="ml-3" onClick={refresh} disabled={busy}>
              Refresh
            </Button>
          )}
        </Notice>
      )}
      <Field id="make" label="Make" error={fields.make}>
        <input {...fieldProps("make")} autoFocus />
      </Field>
      <Field id="model" label="Model" error={fields.model}>
        <input {...fieldProps("model")} />
      </Field>
      <Field id="year" label="Year" error={fields.year}>
        <input {...fieldProps("year")} type="number" inputMode="numeric" />
      </Field>
      <Field id="status" label="Status" error={fields.status}>
        <select {...fieldProps("status")}>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </Field>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" primary disabled={busy || conflict || !isDirty}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
