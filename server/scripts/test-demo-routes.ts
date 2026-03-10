/**
 * Testa as rotas de demo (Node, sem Edge Functions).
 * Uso: com o servidor rodando (npm run dev na pasta server), execute:
 *   npx tsx scripts/test-demo-routes.ts
 *
 * Requer: servidor na porta 3001 (ou API_BASE_URL).
 */

const BASE = process.env.API_BASE_URL || "http://localhost:3001";
const DEMO_INFO = `${BASE.replace(/\/+$/, "").replace(/\/api$/, "")}/api/demo/public-agent-info`;

async function main() {
  console.log("Testando rotas de demo (backend Node)...\n");

  // 1) Sem agent_id -> 400
  const r1 = await fetch(`${DEMO_INFO}`);
  const ok1 = r1.status === 400;
  console.log(ok1 ? "✓ GET sem agent_id → 400" : `✗ GET sem agent_id → ${r1.status} (esperado 400)`);
  if (!ok1 && r1.ok) console.log(await r1.text());

  // 2) agent_id inválido (UUID que não existe) -> 404
  const r2 = await fetch(`${DEMO_INFO}?agent_id=00000000-0000-0000-0000-000000000000`);
  const ok2 = r2.status === 404;
  console.log(ok2 ? "✓ GET agent_id inexistente → 404" : `✗ GET agent_id inexistente → ${r2.status} (esperado 404)`);
  if (!ok2) {
    const text = await r2.text();
    if (r2.status === 200) {
      try {
        const j = JSON.parse(text);
        if (j.id && j.name !== undefined) console.log("  (resposta 200 com dados do agente – ID existe no banco)");
      } catch {}
    } else {
      console.log("  Resposta:", text.slice(0, 200));
    }
  }

  // 3) Se tiver AGENT_ID no env, testar 200 e shape
  const agentId = process.env.TEST_AGENT_ID;
  if (agentId) {
    const r3 = await fetch(`${DEMO_INFO}?agent_id=${encodeURIComponent(agentId)}`);
    const ok3 = r3.status === 200;
    console.log(ok3 ? "✓ GET agent_id válido → 200" : `✗ GET agent_id válido → ${r3.status}`);
    if (ok3) {
      const data = await r3.json();
      const hasShape =
        typeof data.id === "string" &&
        typeof data.name === "string" &&
        data.config &&
        typeof data.config.sandbox_password === "string" || data.config.sandbox_password === null;
      console.log(hasShape ? "  ✓ Resposta com id, name, config.sandbox_password" : "  ✗ Shape inesperado");
    }
  } else {
    console.log("  (opcional: TEST_AGENT_ID=uuid para testar 200)");
  }

  console.log("\nConclusão: rotas de demo estão no backend Node (GET /api/demo/public-agent-info).");
}

main().catch((e) => {
  console.error("Erro:", e.message);
  process.exit(1);
});
