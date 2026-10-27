import { useState, type FormEvent } from "react";
import Button from "../components/Button";
import Field, { controlClass } from "../components/Field";
import Logo from "../components/Logo";
import Notice from "../components/Notice";
import { getMe, login } from "../services/auth";
import type { ApiError } from "../services/handleApiError";
import type { User } from "../types";

interface LoginPageProps {
  notice: string;
  onLogin: (user: User) => void;
}

export default function LoginPage({ notice, onLogin }: LoginPageProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    setBusy(true);
    setError("");

    try {
      await login(email, password);
      onLogin(await getMe());
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.status === 401 ? "Invalid email or password." : apiError.message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-linear-to-br from-indigo-50 via-slate-50 to-violet-100 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <Logo className="mb-5 size-12" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">Manage your dealership inventory.</p>
        {(error || notice) && <Notice kind="error">{error || notice}</Notice>}
        <form onSubmit={submit}>
          <Field id="email" label="Email">
            <input id="email" name="email" type="email" autoComplete="username" required autoFocus className={controlClass} />
          </Field>
          <Field id="password" label="Password">
            <input id="password" name="password" type="password" autoComplete="current-password" required className={controlClass} />
          </Field>
          <Button type="submit" primary disabled={busy} className="mt-2 w-full py-2">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
