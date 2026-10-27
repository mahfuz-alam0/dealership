import { useEffect, useState } from "react";
import { getMe } from "./services/auth";
import { onUnauthorized, type ApiError } from "./services/handleApiError";
import InventoryPage from "./pages/InventoryPage";
import LoginPage from "./pages/LoginPage";
import type { User } from "./types";

// user: undefined = still checking the session, null = signed out.
interface Session {
  user: User | null | undefined;
  notice: string;
}

export default function App() {
  const [{ user, notice }, setSession] = useState<Session>({ user: undefined, notice: "" });

  useEffect(() => {
    // Mid-session 401 = expiry. Ignored while signed out (first-load /api/me, bad login).
    onUnauthorized((message) => {
      setSession((session) => (session.user ? { user: null, notice: message } : session));
    });

    getMe().then(
      (signedInUser) => setSession({ user: signedInUser, notice: "" }),
      (error: ApiError) => {
        const message = error.status === 401 ? "" : error.message;
        setSession({ user: null, notice: message });
      },
    );
  }, []);

  // Route guard: no session -> /login. Only two screens, so the URL is synced by hand instead of pulling in a router.
  useEffect(() => {
    if (user !== undefined) {
      history.replaceState(null, "", user ? "/" : "/login");
    }
  }, [user]);

  if (user === undefined) {
    return (
      <p role="status" className="mx-auto my-12 max-w-sm p-4 text-center text-slate-500">
        Loading…
      </p>
    );
  }

  if (user) {
    return <InventoryPage user={user} onLogout={() => setSession({ user: null, notice: "" })} />;
  }

  return <LoginPage notice={notice} onLogin={(signedInUser) => setSession({ user: signedInUser, notice: "" })} />;
}
