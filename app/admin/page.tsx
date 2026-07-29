"use client";

import { FormEvent, useEffect, useState } from "react";

type User = { id: number; email: string; name: string; storeNumber: string; role: string; createdAt: string; lastLoginAt: string };

export default function AdminPage() {
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [share, setShare] = useState({ enabled: false, url: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const auth = await fetch("/api/auth", { cache: "no-store" });
    const status = await auth.json() as { user?: { id: number; role: string } };
    if (!status.user) { window.location.href = "/"; return; }
    setMe(status.user);
    if (status.user.role !== "admin") return;
    const [accounts, publicLink] = await Promise.all([
      fetch("/api/admin/users", { cache: "no-store" }),
      fetch("/api/admin/public-schedule", { cache: "no-store" }),
    ]);
    if (accounts.ok) setUsers(((await accounts.json()) as { users: User[] }).users);
    if (publicLink.ok) setShare(await publicLink.json() as { enabled: boolean; url: string });
  }

  useEffect(() => { void load(); }, []);

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json() as { users?: User[]; error?: string };
    if (response.ok && result.users) { setUsers(result.users); form.reset(); setMessage("Account created."); }
    else setMessage(result.error || "The account could not be created.");
    setBusy(false);
  }

  async function changeRole(id: number, role: string) {
    const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, role }) });
    const result = await response.json() as { users?: User[]; error?: string };
    if (response.ok && result.users) { setUsers(result.users); setMessage("Access level updated."); }
    else setMessage(result.error || "Access could not be updated.");
  }

  async function removeUser(id: number) {
    if (!window.confirm("Delete this account and sign it out everywhere?")) return;
    const response = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    const result = await response.json() as { users?: User[]; error?: string };
    if (response.ok && result.users) { setUsers(result.users); setMessage("Account deleted."); }
    else setMessage(result.error || "Account could not be deleted.");
  }

  async function rotateLink() {
    setBusy(true);
    const response = await fetch("/api/admin/public-schedule", { method: "POST" });
    const result = await response.json() as { enabled?: boolean; url?: string; error?: string };
    if (response.ok) { setShare({ enabled: true, url: result.url || "" }); setMessage("A new public schedule link is active. Any older link no longer works."); }
    else setMessage(result.error || "The public link could not be created.");
    setBusy(false);
  }

  async function disableLink() {
    await fetch("/api/admin/public-schedule", { method: "DELETE" });
    setShare({ enabled: false, url: "" }); setMessage("The public schedule link is disabled.");
  }

  if (!me) return <main className="admin-shell"><p>Loading…</p></main>;
  if (me.role !== "admin") return <main className="admin-shell"><section className="admin-card"><h1>Administrator Access Required</h1><a className="secondary" href="/">Return to Food Truck Admin</a></section></main>;

  return <main className="admin-shell">
    <header className="admin-header"><div><p className="eyebrow">FOOD TRUCK ADMIN</p><h1>People & Access</h1><p>Add coworkers, set permissions, and control the public truck schedule.</p></div><a className="secondary" href="/">← Back to Dashboard</a></header>
    {message && <div className="admin-message" role="status">{message}</div>}
    <section className="admin-grid">
      <article className="admin-card">
        <h2>Add a Coworker</h2><p>Give them a temporary password. They can use it to sign in immediately.</p>
        <form className="form-grid" onSubmit={addUser}>
          <label>Name<input name="name" required /></label>
          <label>Email<input name="email" type="email" required /></label>
          <label>Temporary password<input name="password" type="password" minLength={12} required /></label>
          <label>Access level<select name="role" defaultValue="associate"><option value="associate">Associate — view only</option><option value="manager">Manager — edit schedules and trucks</option></select></label>
          <button className="primary full" disabled={busy}>Create Account</button>
        </form>
      </article>
      <article className="admin-card">
        <h2>Public Schedule Link</h2><p>Anyone with this private link can view the schedule without signing in. It contains no contacts, compliance dates, or internal notes.</p>
        {share.enabled ? <><label className="share-field">Active link<input readOnly value={share.url} onFocus={(event) => event.currentTarget.select()} /></label><div className="admin-actions"><button className="primary" onClick={() => navigator.clipboard.writeText(share.url)}>Copy Link</button><button className="secondary" disabled={busy} onClick={rotateLink}>Rotate Link</button><button className="danger-button" onClick={disableLink}>Disable</button></div></> : <button className="primary" disabled={busy} onClick={rotateLink}>Create Public Schedule Link</button>}
      </article>
    </section>
    <section className="admin-card user-list"><h2>Accounts</h2><div className="permission-key"><span><strong>Admin</strong> Full access and account management</span><span><strong>Manager</strong> Edit schedules, trucks, and location</span><span><strong>Associate</strong> View only</span></div>
      <div className="user-table"><div className="user-row user-head"><span>Person</span><span>Access</span><span>Last sign-in</span><span></span></div>{users.map((account) => <div className="user-row" key={account.id}><span><strong>{account.name || "Unnamed"}</strong><small>{account.email}</small></span><select value={account.role} disabled={account.id === me.id} onChange={(event) => void changeRole(account.id, event.target.value)}><option value="associate">Associate</option><option value="manager">Manager</option><option value="admin">Admin</option></select><span>{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : "Never"}</span><button className="text-button danger-text" disabled={account.id === me.id} onClick={() => void removeUser(account.id)}>Delete</button></div>)}</div>
    </section>
  </main>;
}
