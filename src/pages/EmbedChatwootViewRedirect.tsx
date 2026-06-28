import { Navigate, useSearchParams } from "react-router-dom";

/** Alias para URLs antigas/erradas: /embed/chatwoot/view → /embed/chatwoot */
export default function EmbedChatwootViewRedirect() {
  const [params] = useSearchParams();
  const qs = params.toString();
  return <Navigate to={`/embed/chatwoot${qs ? `?${qs}` : ""}`} replace />;
}
