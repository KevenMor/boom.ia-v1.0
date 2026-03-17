# Configuração do Google Maps para consulta de unidades

A ferramenta `consultar_unidade` / `nearest_unit` calcula a distância entre o CEP do cliente e as unidades. Por padrão usa **Haversine** (distância em linha reta), que não considera ruas nem trânsito.

Para distâncias reais de **carro**, configure a **Google Maps Distance Matrix API**.

---

## 1. Criar projeto no Google Cloud

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um projeto ou selecione um existente
3. Ative a **faturamento** (billing) — necessário mesmo para uso gratuito

---

## 2. Habilitar a API

1. No menu, vá em **APIs e Serviços** → **Biblioteca**
2. Busque por **"Distance Matrix API"**
3. Clique em **Habilitar**

---

## 3. Criar chave de API

1. Vá em **APIs e Serviços** → **Credenciais**
2. Clique em **+ Criar credenciais** → **Chave de API**
3. Copie a chave gerada

**Segurança (recomendado):**
- Em **Restrições de API**, restrinja a chave apenas à **Distance Matrix API**
- Em **Restrições de aplicativo**, adicione os IPs do seu servidor (VPS, EasyPanel, etc.)

---

## 4. Configurar no projeto

Adicione a variável de ambiente no servidor:

```env
GOOGLE_MAPS_API_KEY=sua_chave_aqui
```

**Onde configurar:**
- **EasyPanel:** Serviço do servidor → Variáveis de ambiente
- **Docker Compose:** na seção `environment` do serviço server
- **Local:** arquivo `.env` na pasta `server/`

---

## 5. Configurar no ambiente de deploy (Easypanel, Docker, etc.)

**Importante:** A variável deve estar configurada no ambiente onde o servidor roda:
- **Easypanel:** Serviço do servidor → Variáveis de ambiente → adicione `GOOGLE_MAPS_API_KEY`
- **Docker:** passe via `-e GOOGLE_MAPS_API_KEY=...` ou no compose
- O `.env` local **não** é usado em produção — configure no painel do provedor

## 6. Reiniciar o servidor

Após configurar a chave, reinicie o serviço do servidor para carregar a variável.

---

## Resultado

| Sem chave (Haversine) | Com chave (Google Maps) |
|----------------------|--------------------------|
| "5.4 km (linha reta)" | "5,4 km" (distância real de carro) |
| Sem tempo de viagem | "12 min" (tempo estimado) |

O resultado inclui `method: "google_maps"` quando a API é usada, ou `method: "haversine"` quando a chave não está configurada ou a chamada falha.

---

## Custos

- Google oferece **$200 de crédito mensal** (cobre ~40.000 elementos)
- 1 elemento = 1 origem × 1 destino
- Ex.: 1 CEP + 5 unidades = 5 elementos
- Consulte [preços](https://developers.google.com/maps/documentation/distance-matrix/usage-and-billing)
