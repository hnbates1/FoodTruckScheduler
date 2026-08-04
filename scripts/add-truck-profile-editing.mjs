import { readFile, writeFile } from "node:fs/promises";

const PAGE_PATH = new URL("../app/page.tsx", import.meta.url);
const API_PATH = new URL("../app/api/data/route.ts", import.meta.url);
const MARKER = "// truck-profile-editing-v2";

let page = await readFile(PAGE_PATH, "utf8");

if (!page.includes(MARKER)) {
  page = page.replace(
    '  const [modal, setModal] = useState<"visit" | "truck" | null>(null);',
    '  const [modal, setModal] = useState<"visit" | "truck" | null>(null);\n  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);\n  ' + MARKER,
  );

  page = page.replace(
    '    try {\n      await save("truck", payload);\n      setModal(null);\n      notify("Truck profile created");',
    '    try {\n      if (editingTruck) {\n        const response = await fetch("/api/data", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "truck", id: editingTruck.id, ...payload }) });\n        if (!response.ok) throw new Error("Update failed");\n        const next = await response.json() as AppData;\n        setData({ ...next, trucks: next.trucks.map(withAvailability) });\n        setEditingTruck(null);\n        setModal(null);\n        notify("Truck profile updated");\n      } else {\n        await save("truck", payload);\n        setModal(null);\n        notify("Truck profile created");\n      }',
  );

  page = page.replace(
    '      const optimistic: Truck = { id: Date.now(),',
    '      if (editingTruck) { notify("That truck profile could not be updated"); return; }\n      const optimistic: Truck = { id: Date.now(),',
  );

  page = page.replace(
    'onAdd={() => setModal("truck")} onDelete={setPendingDeleteId}',
    'onAdd={() => { setEditingTruck(null); setModal("truck"); }} onEdit={(truck) => { setEditingTruck(truck); setModal("truck"); }} onDelete={setPendingDeleteId}',
  );

  page = page.replace(
    '{modal === "truck" && <Modal title="Create truck profile" subtitle="Keep contact, compliance, and scheduling preferences together." onClose={() => setModal(null)}><TruckForm onSubmit={submitTruck} /></Modal>}',
    '{modal === "truck" && <Modal title={editingTruck ? "Edit truck profile" : "Create truck profile"} subtitle="Keep contact, compliance, and scheduling preferences together." onClose={() => { setEditingTruck(null); setModal(null); }}><TruckForm truck={editingTruck || undefined} onSubmit={submitTruck} /></Modal>}',
  );

  page = page.replace(
    '  onAdd,\n  onDelete,',
    '  onAdd,\n  onEdit,\n  onDelete,',
  );
  page = page.replace(
    '  onAdd: () => void;\n  onDelete: (id: number) => void;',
    '  onAdd: () => void;\n  onEdit: (truck: Truck) => void;\n  onDelete: (id: number) => void;',
  );
  page = page.replace(
    '<div className="profile-head"><TruckAvatar truck={selected} large /><div><h2>{selected.name}</h2><p>{selected.cuisine}</p></div></div>',
    '<div className="profile-head"><TruckAvatar truck={selected} large /><div><h2>{selected.name}</h2><p>{selected.cuisine}</p></div>{["admin", "manager"].includes(role) && <button type="button" className="secondary" onClick={() => onEdit(selected)}>✎ Edit Profile</button>}</div>',
  );

  page = page.replace(
    'function TruckForm({ onSubmit }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {\n  const [cuisineChoice, setCuisineChoice] = useState("");\n  const [customCuisine, setCustomCuisine] = useState("");\n  const [logoData, setLogoData] = useState("");',
    'function TruckForm({ truck, onSubmit }: { truck?: Truck; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {\n  const isCommonCuisine = truck ? commonCuisines.includes(truck.cuisine) : false;\n  const [cuisineChoice, setCuisineChoice] = useState(truck ? (isCommonCuisine ? truck.cuisine : "custom") : "");\n  const [customCuisine, setCustomCuisine] = useState(truck && !isCommonCuisine ? truck.cuisine : "");\n  const [logoData, setLogoData] = useState(truck?.logoData || "");',
  );

  const defaults = [
    ['<input name="name" placeholder="Truck name" required />','<input name="name" placeholder="Truck name" defaultValue={truck?.name || ""} required />'],
    ['<input name="contact" placeholder="Owner or coordinator" required />','<input name="contact" placeholder="Owner or coordinator" defaultValue={truck?.contact || ""} required />'],
    ['<input name="phone" type="tel" required />','<input name="phone" type="tel" defaultValue={truck?.phone || ""} required />'],
    ['<input name="email" type="email" required />','<input name="email" type="email" defaultValue={truck?.email || ""} required />'],
    ['<input name="insuranceExpiry" type="date" />','<input name="insuranceExpiry" type="date" defaultValue={truck?.insuranceExpiry || ""} />'],
    ['<input name="licenseExpiry" type="date" />','<input name="licenseExpiry" type="date" defaultValue={truck?.licenseExpiry || ""} />'],
    ['<input name="preferredStart" type="time" defaultValue="11:00" />','<input name="preferredStart" type="time" defaultValue={truck?.preferredStart || "11:00"} />'],
    ['<input name="preferredEnd" type="time" defaultValue="15:00" />','<input name="preferredEnd" type="time" defaultValue={truck?.preferredEnd || "15:00"} />'],
    ['<textarea name="notes" placeholder="Electrical needs, setup notes, strongest dayparts…" />','<textarea name="notes" defaultValue={truck?.notes || ""} placeholder="Electrical needs, setup notes, strongest dayparts…" />'],
    ['<button className="primary full" type="submit">Create truck profile</button>','<button className="primary full" type="submit">{truck ? "Save profile changes" : "Create truck profile"}</button>'],
  ];
  for (const [before, after] of defaults) page = page.replace(before, after);

  page = page.replace(
    'name="paymentMethods" value={method} />{method}',
    'name="paymentMethods" value={method} defaultChecked={truck?.paymentTypes?.split(",").map((item) => item.trim()).includes(method)} />{method}',
  );
  page = page.replace(
    'name="availabilityDays" value={day} defaultChecked={day >= 1 && day <= 5}',
    'name="availabilityDays" value={day} defaultChecked={truck ? withAvailability(truck).availability.find((slot) => slot.day === day)?.enabled : day >= 1 && day <= 5}',
  );
  page = page.replace(
    'name={`start_${day}`} defaultValue="11:00"',
    'name={`start_${day}`} defaultValue={truck ? withAvailability(truck).availability.find((slot) => slot.day === day)?.start || truck.preferredStart : "11:00"}',
  );
  page = page.replace(
    'name={`end_${day}`} defaultValue="15:00"',
    'name={`end_${day}`} defaultValue={truck ? withAvailability(truck).availability.find((slot) => slot.day === day)?.end || truck.preferredEnd : "15:00"}',
  );
}

await writeFile(PAGE_PATH, page);

let api = await readFile(API_PATH, "utf8");
if (!api.includes(MARKER)) {
  api = api.replace(
    '    if (payload.kind === "truckLogo") {',
    `    ${MARKER}\n    if (payload.kind === "truck") {\n      if (!Number.isInteger(id) || id <= 0 || !text(payload.name).trim()) {\n        return Response.json({ error: "A valid truck profile is required." }, { status: 400 });\n      }\n      if (postgresUrl()) {\n        const pool = await postgres();\n        await pool.query(\`UPDATE trucks SET name=$1,cuisine=$2,contact=$3,phone=$4,email=$5,insurance_expiry=$6,license_expiry=$7,preferred_start=$8,preferred_end=$9,notes=$10,availability_json=$11,payment_types=$12 WHERE id=$13\`, [text(payload.name),text(payload.cuisine),text(payload.contact),text(payload.phone),text(payload.email),text(payload.insuranceExpiry),text(payload.licenseExpiry),text(payload.preferredStart),text(payload.preferredEnd),text(payload.notes),JSON.stringify(payload.availability ?? []),text(payload.paymentTypes),id]);\n        return Response.json(await readAllPostgres(pool));\n      }\n      const db = await database();\n      await db.prepare("UPDATE trucks SET name=?,cuisine=?,contact=?,phone=?,email=?,insurance_expiry=?,license_expiry=?,preferred_start=?,preferred_end=?,notes=?,availability_json=?,payment_types=? WHERE id=?")\n        .bind(text(payload.name),text(payload.cuisine),text(payload.contact),text(payload.phone),text(payload.email),text(payload.insuranceExpiry),text(payload.licenseExpiry),text(payload.preferredStart),text(payload.preferredEnd),text(payload.notes),JSON.stringify(payload.availability ?? []),text(payload.paymentTypes),id).run();\n      return Response.json(await readAll(db));\n    }\n    if (payload.kind === "truckLogo") {`,
  );
  api = api.replace('return Response.json({ error: "Unable to update this visit." }, { status: 500 });','return Response.json({ error: "Unable to update this record." }, { status: 500 });');
}
await writeFile(API_PATH, api);
