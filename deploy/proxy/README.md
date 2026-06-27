# Reverse proxy TLS (nginx) — Renner Coatings

Proxy reverso único que atende as aplicações na VM, terminando o HTTPS:

- `astecagenda.rennercoatings.com` → container `astec-app:5000`
- `credito.rennercoatings.com` → container `credito-cobranca:3000`
- porta **80** redireciona tudo para **443**

> **Local real na VM:** `/home/super/reverse-proxy/`
> Os arquivos aqui no repositório são a cópia versionada dessa pasta.
> O proxy roteia pelos nomes dos containers via redes Docker das apps
> (`agenda-astec_default` e `credito-cobranca_default`), por isso está
> conectado às duas redes (ver `docker-compose.yml`).

## Certificado

- Tipo: **wildcard** `*.rennercoatings.com` (SAN: `*.rennercoatings.com`, `rennercoatings.com`) — cobre os dois domínios.
- Emissor: Sectigo Public Server Authentication CA DV R36.
- Validade: 15/01/2026 a 15/02/2027.
- Arquivos (na VM, em `./certs/`, **não versionados**):
  - `rennercoatings.crt` → **fullchain** (certificado folha + intermediário Sectigo)
  - `rennercoatings.key` → chave privada (PEM, sem senha, `chmod 600`)

### Como o fullchain foi montado

O PEM entregue pela equipe trazia só o certificado folha. O intermediário foi
baixado da Sectigo e concatenado (folha primeiro):

```bash
curl -fsS -o inter.crt http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt
openssl x509 -inform DER -in inter.crt -out inter.pem
cat folha.crt inter.pem > rennercoatings.crt   # fullchain
```

## Operação

```bash
cd /home/super/reverse-proxy

# aplicar mudanças de portas/volumes (recria o container)
docker compose up -d

# recarregar só o nginx.conf (sem downtime)
docker exec reverse-proxy nginx -s reload

# testar a config
docker exec reverse-proxy nginx -t

# logs
docker logs -f reverse-proxy
```

## Renovação do certificado (antes de fev/2027)

1. Gerar o novo PEM (`.crt` + `.key`).
2. Montar o fullchain (folha + intermediário) como acima.
3. Substituir `./certs/rennercoatings.crt` e `./certs/rennercoatings.key`.
4. `docker exec reverse-proxy nginx -s reload`.

## Validação rápida

```bash
curl -I --resolve astecagenda.rennercoatings.com:443:127.0.0.1 https://astecagenda.rennercoatings.com/
curl -I --resolve credito.rennercoatings.com:443:127.0.0.1     https://credito.rennercoatings.com/
curl -I --resolve astecagenda.rennercoatings.com:80:127.0.0.1  http://astecagenda.rennercoatings.com/   # deve dar 301
```

## Observações

- DNS de `astecagenda` e `credito` deve apontar para o IP da VM; firewall/rede deve liberar 80 e 443.
- O ASTEC publica só a porta 5000 no host (o proxy o alcança pela rede Docker).
- Os arquivos `.crt`/`.key` são segredos e **não** vão para o git.
