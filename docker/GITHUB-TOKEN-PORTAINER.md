# Token GitHub para Portainer (stack a partir do repositório)

O token do GitHub **não vai no .env da stack**. Ele é usado só pelo Portainer para clonar o repositório e fica na **autenticação do repositório** na tela da Stack.

---

## 1. Gerar o token no GitHub

1. No GitHub: **Settings** (do seu usuário) → **Developer settings** → **Personal access tokens**.
2. Clique em **Generate new token** (ou **Generate new token (classic)**).
3. **Note**: por exemplo `Portainer - boom-ia`.
4. **Expiration**: escolha um prazo (ex.: 90 dias ou No expiration).
5. **Scopes**:
   - Repositório **público**: marque `public_repo`.
   - Repositório **privado**: marque `repo` (acesso total a repositórios privados).
6. **Generate token** e **copie o token** na hora (ele não aparece de novo).

---

## 2. Configurar no Portainer

1. **Stacks** → **Add stack** (ou edite a stack existente).
2. Em **Build method**, escolha **Git repository**.
3. Preencha:
   - **Repository URL**: `https://github.com/KevenMor/boom.ia-v1.0` (ou seu repositório).
   - **Repository reference**: `main` (ou a branch que você usa).
4. Ative **Repository authentication** (ou **Use authentication**).
5. Preencha:
   - **Username**: seu usuário do GitHub (ex.: `KevenMor`). Para token clássico pode ser o próprio usuário.
   - **Password**: **cole o Personal Access Token** (não use a senha da conta).
6. Salve e faça o deploy da stack.

Assim o Portainer usa o token só para fazer `git clone`; as variáveis da aplicação continuam no **.env da stack** (como no `.env.stack`), sem colocar o token do GitHub lá.

---

## Resumo

| Onde | O que colocar |
|------|----------------|
| **Portainer → Stack → Repository authentication** | Username do GitHub + **Personal Access Token** (no campo Password) |
| **.env da stack** | **Não** coloque o token do GitHub; use só as variáveis do `.env.stack` (Supabase, ENCRYPTION_KEY, etc.) |
