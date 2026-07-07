import { Navigate, useSearchParams } from "react-router-dom";

/** Alias /embed/chatwoot/loteamentos/view → hash credentials no app React */
export default function EmbedChatwootLoteamentosViewRedirect() {
  const [params] = useSearchParams();
  const hash = new URLSearchParams();
  const key = params.get("key");
  const accountId = params.get("account_id");
  const theme = params.get("theme");
  if (key) hash.set("key", key);
  if (accountId) hash.set("account_id", accountId);
  if (theme) hash.set("theme", theme);
  const qs = hash.toString();
  return <Navigate to={`/embed/chatwoot/loteamentos${qs ? `#${qs}` : ""}`} replace />;
}
