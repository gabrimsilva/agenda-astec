#!/usr/bin/env node
/**
 * Script para testar MFA localmente
 * Executa: node test-mfa-local.js
 */

const http = require('http');

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
    console.log(`Response:`, JSON.stringify(testRes.data, null, 2));

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
      console.log(`MFA Required: ${loginRes.data.mfaRequired || false}`);
      console.log(`Token recebido: ${!!loginRes.data.token}`);

      // Teste 3: Setup MFA
      console.log('\n3️⃣  POST /auth/mfa/setup - Gerar QR code');
      const setupRes = await makeRequest('POST', '/auth/mfa/setup', {});
      setupRes.data.headers = { 'Authorization': `Bearer ${token}` };
      console.log(`Status: ${setupRes.status}`);
      console.log(`QR Code: ${setupRes.data.qrCode ? 'Gerado ✓' : 'Falhou ✗'}`);
      console.log(`Secret: ${setupRes.data.secret ? 'Gerado ✓' : 'Falhou ✗'}`);
      console.log(`Backup Codes: ${setupRes.data.backupCodes ? setupRes.data.backupCodes.length + ' codes' : 'Falhou ✗'}`);

      if (setupRes.data.secret && setupRes.data.backupCodes) {
        const secret = setupRes.data.secret;
        const backupCodes = setupRes.data.backupCodes;

        // Teste 4: Validar TOTP (usando speakeasy localmente)
        console.log('\n4️⃣  Gerando código TOTP para teste...');
        const speakeasy = require('speakeasy');
        const totpCode = speakeasy.totp({
          secret: secret,
          encoding: 'base32',
        });
        console.log(`Código TOTP gerado: ${totpCode}`);

        // Teste 5: Confirmar MFA
        console.log('\n5️⃣  POST /auth/mfa/confirm - Confirmar MFA');
        const confirmRes = await makeRequest('POST', '/auth/mfa/confirm', {
          totpCode: totpCode,
          secret: secret,
          backupCodes: backupCodes,
        });
        console.log(`Status: ${confirmRes.status}`);
        console.log(`MFA Enabled: ${confirmRes.data.message ? '✓' : '✗'}`);

        // Teste 6: Verificar status MFA
        console.log('\n6️⃣  GET /auth/mfa/status - Status MFA');
        const statusRes = await makeRequest('GET', '/auth/mfa/status', null);
        console.log(`Status: ${statusRes.status}`);
        console.log(`Response:`, JSON.stringify(statusRes.data, null, 2));
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Testes completados!');
    console.log('\n📝 Próximos passos:');
    console.log('  1. Abrir Postman');
    console.log('  2. Importar MFA_Tests_Postman.json');
    console.log('  3. Configurar variáveis (BASE_URL=http://localhost:5000)');
    console.log('  4. Executar testes');

  } catch (error) {
    console.error('\n❌ Erro durante testes:', error.message);
  }
}

runTests();
