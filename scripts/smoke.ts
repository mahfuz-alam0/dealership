// Deployed smoke test (guides/test-cases.md section E): `APP_URL=https://... npm run smoke`.
// Edits one Alpha vehicle and restores it at the end, so it is repeatable.
declare const process: { env: Record<string, string | undefined> }; // no @types/node; tsx provides it at runtime
export {}; // makes this a module so top-level await typechecks

const baseUrl = process.env.APP_URL?.replace(/\/$/, "");
if (!baseUrl) {
  throw new Error("Set APP_URL, e.g. APP_URL=https://dealership-app.<subdomain>.workers.dev");
}

const PASSWORD = "Dealer#2026";

interface Vehicle {
  id: number;
  make: string;
  model: string;
  year: number;
  status: string;
  version: number;
}

function call(path: string, cookie = "", init: RequestInit = {}) {
  return fetch(baseUrl + path, { ...init, headers: { cookie, "content-type": "application/json" } });
}

function put(cookie: string, vehicle: Vehicle, body: object) {
  return call(`/api/vehicles/${vehicle.id}`, cookie, { method: "PUT", body: JSON.stringify(body) });
}

function eq(got: unknown, want: unknown, what: string) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
}

function step(name: string) {
  console.log(`ok  ${name}`);
}

async function login(email: string) {
  const response = await call("/api/login", "", { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) });
  eq(response.status, 200, `login ${email}`);
  return response.headers.get("set-cookie")!.split(";")[0];
}

eq((await call("/api/health")).status, 200, "S1 health");
step("S1 health");

const admin1 = await login("admin1@alpha.test");
step("S2 login admin1");

const vehicles = (await (await call("/api/vehicles", admin1)).json()) as Vehicle[];
const [vehicle] = vehicles;
const edit = {
  make: vehicle.make,
  model: vehicle.model,
  year: vehicle.year,
  status: vehicle.status === "sold" ? "available" : "sold",
};

const updated = await put(admin1, vehicle, { ...edit, version: vehicle.version });
eq(updated.status, 200, "S3 status");
eq(((await updated.json()) as Vehicle).version, vehicle.version + 1, "S3 version");
step("S3 update, version +1");

const asViewer = await put(await login("viewer@alpha.test"), vehicle, { ...edit, version: vehicle.version + 1 });
eq(asViewer.status, 403, "S4 status");
step("S4 viewer PUT rejected");

const asOtherAdmin = await put(await login("admin2@alpha.test"), vehicle, { ...edit, status: vehicle.status, version: vehicle.version });
eq(asOtherAdmin.status, 409, "S5 status");
step("S5 stale edit -> 409");

const final = (await (await call(`/api/vehicles/${vehicle.id}`, admin1)).json()) as Vehicle;
eq({ ...final, version: 0 }, { id: vehicle.id, ...edit, version: 0 }, "S6 values");
step("S6 final read matches S3");

const restored = await put(admin1, vehicle, {
  make: vehicle.make,
  model: vehicle.model,
  year: vehicle.year,
  status: vehicle.status,
  version: final.version,
});
eq(restored.status, 200, "restore status");
step("restored original values");

const betaAdmin = await login("admin1@beta.test");
const [betaVehicle] = (await (await call("/api/vehicles", betaAdmin)).json()) as Vehicle[];
const betaBody = { make: betaVehicle.make, model: betaVehicle.model, year: betaVehicle.year, status: betaVehicle.status };

eq((await call(`/api/vehicles/${betaVehicle.id}`, admin1)).status, 404, "S7 cross-dealership GET");
eq((await put(admin1, betaVehicle, { ...betaBody, make: "Hacked", version: betaVehicle.version })).status, 404, "S7 cross-dealership PUT");
const betaAfter = (await (await call(`/api/vehicles/${betaVehicle.id}`, betaAdmin)).json()) as Vehicle;
eq(betaAfter, betaVehicle, "S7 other dealership data unchanged");
step("S7 cross-dealership GET and PUT -> 404, data unchanged");
