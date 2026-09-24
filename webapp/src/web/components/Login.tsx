import { useState } from "react";

import { api } from "../api";

export function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="login card"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        api.login(pw).then(onDone).catch((x: Error) => setErr(x.message)).finally(() => setBusy(false));
      }}
    >
      <h1><span className="heart">♥</span> Heart Frame</h1>
      <input type="password" autoFocus placeholder="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
      <button className="primary" disabled={busy || !pw}>Log in</button>
      {err && <p className="error">{err}</p>}
    </form>
  );
}
