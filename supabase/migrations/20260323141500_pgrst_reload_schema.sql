-- Idempotente: se já aplicaste 410 manualmente sem esta linha, corre só isto (ou este ficheiro).
NOTIFY pgrst, 'reload schema';
