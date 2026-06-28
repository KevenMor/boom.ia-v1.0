import { Navigate, useSearchParams } from "react-router-dom";

/** Alias /embed/chatwoot/view → /embed/chatwoot#key=... (query vira hash para iframe no Mega) */
export default function EmbedChatwootViewRedirect() {
  const [params] = useSearchParams();
  const hash = new URLSearchParams();
  const key = params.get("key");
  const accountId = params.get("account_id");
  if (key) hash.set("key", key);
  if (accountId) hash.set("account_id", accountId);
  const qs = hash.toString();
  return <Navigate to={`/embed/chatwoot${qs ? `#${qs}` : ""}`} replace />;
}
