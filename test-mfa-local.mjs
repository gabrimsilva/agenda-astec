#!/usr/bin/env node
/**
 * Script para testar MFA localmente
 * Executa: node test-mfa-local.mjs
 */

import http from 'http';
import speakeasy from 'speakeasy';

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n🔐 TESTANDO MFA LOCALMENTE\n');
  console.log('═'.repeat(60));

  try {
    // Teste 1: Criar usuário de teste
    console.log('\n1️⃣  GET /auth/test - Criar usuário teste');
    const testRes = await makeRequest('GET', '/auth/test');
    console.log(`Status: ${testRes.status}`);
    if (testRes.data.credentials) {
      console.log(`Email: ${testRes.data.credentials.email}`);
      console.log(`Password: ${testRes.data.credentials.password}`);
      console.log(`Token: ${testRes.data.token ? 'Gerado ✓' : '✗'}`);
    }

    if (testRes.data.token) {
      const token = testRes.data.token;
      const email = testRes.data.credentials.email;
      const password = testRes.data.credentials.password;

      // Teste 2: Login sem MFA
      console.log('\n2️⃣  POST /auth/login - Login sem MFA');
      const loginRes = await makeRequest('POST', '/auth/login', {
        email: email,
        password: password,
      });
      console.log(`Status: ${loginRes.status}`);
      if (loginRes.data.mfaRequired === undefined) {
        console.log(`✅ Login funcionou! Recebeu token.`);
        console.log(`   Token: ${loginRes.data.token ? '✓' : '✗'}`);
      } else {
        console.log(`MFA Required: ${loginRes.data.mfaRequired}`);
      }

      // Teste 3: Setup MFA
      console.log('\n3️⃣  POST /auth/mfa/setup - Gerar QR code');
      const setupOptions = {
        hostname: 'localhost',
        port: 5000,
        path: '/auth/mfa/setup',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      };

      const setupRes = await new Promise((resolve, reject) => {
        const req = http.request(setupOptions, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(body) });
            } catch (e) {
              resolve({ status: res.statusCode, data: body });
            }
          });
        });
        req.on('error', reject);
        req.end();
      });

      console.log(`Status: ${setupRes.status}`);
      if (setupRes.data.secret) {
        console.log(`✅ Setup MFA funcionou!`);
        console.log(`   QR Code: ${setupRes.data.qrCode ? '✓' : '✗'}`);
        console.log(`   Secret: ${setupRes.data.secret}`);
        console.log(`   Backup Codes: ${setupRes.data.backupCodes ? setupRes.data.backupCodes.length + ' codes' : '✗'}`);

        const secret = setupRes.data.secret;
        const backupCodes = setupRes.data.backupCodes;

        // Gerar TOTP
        console.log('\n4️⃣  Gerando código TOTP...');
        const totpCode = speakeasy.totp({
          secret: secret,
          encoding: 'base32',
        });
        console.log(`✅ Código TOTP: ${totpCode}`);

        // Teste 5: Confirmar MFA
        console.log('\n5️⃣  POST /auth/mfa/confirm - Confirmar MFA');
        const confirmRes = await new Promise((resolve, reject) => {
          const opts = {
            hostname: 'localhost',
            port: 5000,
            path: '/auth/mfa/confirm',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          };
          const req = http.request(opts, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
              try {
                resolve({ status: res.statusCode, data: JSON.parse(body) });
              } catch (e) {
                resolve({ status: res.statusCode, data: body });
              }
            });
          });
          req.on('error', reject);
          req.write(JSON.stringify({
            totpCode: totpCode,
            secret: secret,
            backupCodes: backupCodes,
          }));
          req.end();
        });

        console.log(`Status: ${confirmRes.status}`);
        if (confirmRes.status === 200) {
          console.log(`✅ MFA Confirmado!`);
          console.log(`   ${confirmRes.data.message}`);
        }
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Testes MFA completados!\n');

  } catch (error) {
    console.error('\n❌ Erro:', error.message);
  }

  process.exit(0);
}

runTests();
