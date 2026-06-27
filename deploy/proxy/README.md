# Reverse proxy TLS (nginx) — Renner Coatings

Termina o HTTPS para:
- `astecagenda.rennercoatings.com` → ASTEC (host `127.0.0.1:5000`)
- `credito.rennercoatings.com` → app crédito (host `127.0.0.1:__PORTA_CREDITO__`)

> Pré-requisito: o ASTEC deixou de publicar a porta 80 (ver `docker-compose.yml`
> da raiz) para que o nginx assuma as portas 80/443.

## 1. Extrair certificado e chave do .pfx (na VM)

```bash
cd ~/agenda-astec/deploy/proxy/certs

# certificado + cadeia (todos os certs do .pfx)
openssl pkcs12 -in ~/Desktop/Certificado_RENNERCOATINGS_2025.pfx \
  -nokeys -out rennercoatings.crt -passin pass:'A_SENHA_DO_PFX'

# chave privada (sem senha no arquivo de saida)
openssl pkcs12 -in ~/Desktop/Certificado_RENNERCOATINGS_2025.pfx \
  -nocerts -nodes -out rennercoatings.key -passin pass:'A_SENHA_DO_PFX'

chmod 600 rennercoatings.key
```

> Se o openssl 3.x reclamar de algoritmo legado, adicione `-legacy` aos comandos.

## 2. Preencher a porta da app crédito

Edite `../nginx.conf` e troque `__PORTA_CREDITO__` pela porta real publicada no host.

## 3. Liberar a porta 80 do ASTEC e subir o proxy

```bash
cd ~/agenda-astec
git pull origin main
docker compose up -d           # recria o ASTEC sem publicar a 80
docker compose -f deploy/proxy/docker-compose.yml up -d
```

## 4. Validar

```bash
# Config do nginx valida?
docker exec rhsa-proxy nginx -t

# Responde com o certificado certo?
curl -I https://astecagenda.rennercoatings.com
curl -I https://credito.rennercoatings.com

# HTTP redireciona para HTTPS?
curl -I http://astecagenda.rennercoatings.com
```

## Operação

- Recarregar a config após editar `nginx.conf`:
  `docker exec rhsa-proxy nginx -s reload`
- Logs: `docker logs -f rhsa-proxy`

## Observações

- O DNS de `astecagenda` e `credito` precisa apontar para o IP da VM.
- As portas 80 e 443 precisam estar liberadas no firewall da VM / rede.
- O certificado precisa cobrir os dois nomes (wildcard `*.rennercoatings.com`
  ou SAN com ambos), senão um dos domínios dará aviso de certificado.
- Os arquivos `.crt`/`.key` não são versionados (são segredos).
