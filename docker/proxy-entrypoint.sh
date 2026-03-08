#!/bin/sh
# Aguarda o server estar acessível antes de iniciar o nginx (evita "host not found in upstream")
echo "[Proxy] Aguardando server:3001..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if wget -q -O- --timeout=2 http://server:3001/health 2>/dev/null | grep -q ok; then
    echo "[Proxy] Server respondendo, iniciando nginx."
    break
  fi
  echo "[Proxy] Tentativa $i/20..."
  sleep 3
done
exec nginx -g "daemon off;"
