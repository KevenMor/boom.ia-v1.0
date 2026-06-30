import type { FastifyReply, FastifyRequest } from "fastify";

export function getEmbedKey(req: FastifyRequest): string | null {
  const q = (req.query as { key?: string })?.key?.trim();
  if (q) return q;
  const h = req.headers["x-chatwoot-mirror-key"];
  if (typeof h === "string" && h.trim()) return h.trim();
  return null;
}

export function assertEmbedKey(req: FastifyRequest, reply: FastifyReply): boolean {
  const expected = (process.env.CHATWOOT_MIRROR_EMBED_KEY || "").trim();
  if (!expected) {
    reply.status(503).send({
      error: "CHATWOOT_MIRROR_EMBED_KEY não configurado no servidor (server/.env)",
    });
    return false;
  }
  const got = getEmbedKey(req);
  if (!got || got !== expected) {
    reply.status(401).send({ error: "Chave de espelho inválida ou ausente" });
    return false;
  }
  return true;
}

function frameAncestorsHeader(): string {
  const raw = (process.env.CHATWOOT_EMBED_FRAME_ANCESTORS || "*").trim();
  if (raw === "*") return "frame-ancestors *";
  const origins = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return origins.length ? `frame-ancestors ${origins.join(" ")}` : "frame-ancestors *";
}

export function applyEmbedHeaders(reply: FastifyReply): void {
  reply.header("Content-Security-Policy", frameAncestorsHeader());
}
