# Relay SMTP (Postfix) — disparo de e-mail na VM

Servidor de relay (`boky/postfix`) que centraliza o envio de e-mail das aplicações
da VM. Os apps enviam para o container `mail-relay` pela rede Docker, e ele
encaminha para o **Office 365** (`smtp.office365.com:587`, STARTTLS, autenticado
como `alertas@renner.com.br`).

> **Local real na VM:** `/home/super/mail-relay/`
> O proxy está conectado às redes das duas apps (`agenda-astec_default` e
> `credito-cobranca_default`), então os containers o resolvem pelo nome `mail-relay`.

## Como os apps usam

- **Host SMTP:** `mail-relay`
- **Porta:** `25` (sem auth/sem TLS — rede interna confiável) **ou** `587` (STARTTLS).
- **Sem necessidade de credenciais** nos apps (o relay já autentica no O365).
  Se o app insistir em mandar usuário/senha, tudo bem — o relay aceita e ignora.
- Apenas remetentes do domínio `renner.com.br` são aceitos (`ALLOWED_SENDER_DOMAINS`).

### Crédito (`credito-cobranca`)
Repontado: no `.env.local` ficou `SMTP_HOST=mail-relay` (porta 587, demais campos
iguais). Não foi preciso alterar código.

### ASTEC
Hoje o ASTEC **não envia e-mail pelo servidor** (só gera links WhatsApp/mailto).
Quando for implementar envio server-side, basta usar `SMTP_HOST=mail-relay`,
`SMTP_PORT=25` (sem auth).

## Segredos

A senha do relayhost fica em `.env` (NÃO versionado):

```
RELAYHOST_PASSWORD=********
```

## Operação

```bash
cd /home/super/mail-relay
docker compose up -d           # aplica mudanças
docker logs -f mail-relay      # logs (procurar status=sent)
docker compose restart mail    # reiniciar

# teste de envio pelo próprio relay (loopback)
docker exec mail-relay sh -c "printf 'From: alertas@renner.com.br\nTo: alertas@renner.com.br\nSubject: Teste\n\nok\n' | sendmail -f alertas@renner.com.br alertas@renner.com.br"
docker logs mail-relay 2>&1 | grep status=sent | tail -1
```

## Observações

- O relay **não publica porta no host** (sem `ports:`), então só é acessível
  pelos containers nas redes Docker — não fica exposto externamente.
- IPv4 forçado (`POSTFIX_inet_protocols=ipv4`) para evitar timeout em AAAA do O365.
- Atenção: o O365 vem descontinuando auth básica SMTP; se um dia parar de
  autenticar, será necessário migrar para OAuth2 (XOAUTH2) no relayhost.
