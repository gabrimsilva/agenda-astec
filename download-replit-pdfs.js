#!/usr/bin/env node

/**
 * Script para baixar PDFs de RATs pendentes do Replit
 * Conecta ao banco Neon do Replit e faz download dos arquivos de PDF
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDFS_DIR = path.join(__dirname, 'downloaded_pdfs');

// Connection string para Replit (banco Neon)
const REPLIT_DB = "postgresql://neondb_owner:npg_TEmNFius6W0n@ep-dark-credit-ae6dljaq.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require";

// Criar diretório para PDFs se não existir
if (!fs.existsSync(PDFS_DIR)) {
  fs.mkdirSync(PDFS_DIR, { recursive: true });
  console.log(`📁 Diretório criado: ${PDFS_DIR}`);
}

async function connectDB(connectionString) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('✅ Conectado ao banco Replit (Neon)');
    return client;
  } catch (err) {
    console.error('❌ Erro ao conectar ao Replit:', err.message);
    throw err;
  }
}

/**
 * Busca RATs com URLs de PDF que ainda não foram baixadas localmente
 */
async function getPendingRATs(client) {
  console.log('\n🔍 Buscando RATs com PDFs pendentes...');
  
  try {
    // Primeiro, verificar quais colunas existem
    const columnsResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'rats'
      ORDER BY ordinal_position
    `);
    
    const columns = columnsResult.rows.map(r => r.column_name);
    console.log('📋 Colunas disponíveis na tabela rats:', columns.join(', '));
    
    // Construir query dinamicamente com colunas disponíveis
    const selectCols = [
      'id',
      'report_number',
      'client_name',
      'technician_id',
      'status',
      'imported_pdf_filename',
      'imported_pdf_url',
      'opening_date',
      'created_at',
      columns.includes('downloaded_pdf_path') ? 'downloaded_pdf_path' : 'NULL as downloaded_pdf_path'
    ].filter(col => {
      // Remover aliases inúteis
      const colName = col.split(' ')[0];
      return columns.includes(colName) || col.includes('NULL');
    });
    
    const result = await client.query(`
      SELECT 
        ${selectCols.join(',\n        ')}
      FROM rats 
      WHERE imported_pdf_url IS NOT NULL 
        AND imported_pdf_url != ''
      ORDER BY created_at DESC 
      LIMIT 100
    `);
    
    console.log(`📊 Encontradas ${result.rows.length} RATs com PDFs pendentes`);
    return result.rows;
  } catch (err) {
    console.error('❌ Erro ao buscar RATs:', err.message);
    return [];
  }
}

/**
 * Download de arquivo via HTTPS com retry
 */
function downloadFile(url, filepath, maxRetries = 3) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    
    const attempt = () => {
      https.get(url, { timeout: 30000 }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // Redirect
          console.log(`  ↪️  Redirect para: ${res.headers.location}`);
          downloadFile(res.headers.location, filepath, 0)
            .then(resolve)
            .catch(reject);
          return;
        }
        
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        const fileStream = fs.createWriteStream(filepath);
        res.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(filepath);
        });
        
        fileStream.on('error', (err) => {
          fs.unlink(filepath, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        if (retries < maxRetries) {
          retries++;
          console.log(`  ⚠️  Tentativa ${retries} de ${maxRetries}...`);
          attempt();
        } else {
          reject(err);
        }
      });
    };
    
    attempt();
  });
}

/**
 * Sanitiza nome de arquivo para usar como nome de arquivo
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 200);
}

/**
 * Download de PDFs e atualização do banco de dados
 */
async function downloadPDFs(client, rats) {
  console.log(`\n⬇️  Iniciando download de ${rats.length} PDFs...\n`);
  
  let successful = 0;
  let failed = 0;
  
  for (let i = 0; i < rats.length; i++) {
    const rat = rats[i];
    const progress = `[${i + 1}/${rats.length}]`;
    
    try {
      // Criar nome de arquivo sanitizado
      const baseFilename = rat.imported_pdf_filename || `RAT_${rat.report_number}`;
      const sanitized = sanitizeFilename(baseFilename);
      const filename = `${sanitized}.pdf`;
      const filepath = path.join(PDFS_DIR, filename);
      
      // Skip se já existe
      if (fs.existsSync(filepath)) {
        console.log(`${progress} ✓ ${rat.report_number} - Já existe localmente`);
        
        // Atualizar no banco se necessário
        await client.query(
          'UPDATE rats SET downloaded_pdf_path = $1 WHERE id = $2',
          [filepath, rat.id]
        );
        
        successful++;
        continue;
      }
      
      console.log(`${progress} ⬇️  ${rat.report_number} - Baixando...`);
      
      try {
        await downloadFile(rat.imported_pdf_url, filepath);
        
        const stats = fs.statSync(filepath);
        console.log(`${progress} ✅ ${rat.report_number} - Sucesso! (${(stats.size / 1024).toFixed(2)} KB)`);
        
        // Atualizar no banco com o caminho local
        await client.query(
          'UPDATE rats SET downloaded_pdf_path = $1 WHERE id = $2',
          [filepath, rat.id]
        );
        
        successful++;
      } catch (downloadErr) {
        console.log(`${progress} ❌ ${rat.report_number} - Erro: ${downloadErr.message}`);
        
        // Limpar arquivo parcial se existir
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        
        failed++;
      }
      
    } catch (err) {
      console.log(`${progress} ❌ ${rat.report_number} - Erro: ${err.message}`);
      failed++;
    }
  }
  
  return { successful, failed };
}

/**
 * Gera relatório resumido
 */
function generateReport(rats, results) {
  const reportPath = path.join(PDFS_DIR, 'RELATORIO_DOWNLOAD.txt');
  
  const report = `
╔════════════════════════════════════════════════════════════╗
║   RELATÓRIO DE DOWNLOAD DE PDFs DO REPLIT - ASTEC         ║
╚════════════════════════════════════════════════════════════╝

Data do Download: ${new Date().toLocaleString('pt-BR')}

📊 RESUMO:
  • Total de RATs processadas: ${rats.length}
  • ✅ Downloads bem-sucedidos: ${results.successful}
  • ❌ Falhas: ${results.failed}
  • Taxa de sucesso: ${((results.successful / rats.length) * 100).toFixed(1)}%

📁 LOCAL DE ARMAZENAMENTO:
  ${PDFS_DIR}

📋 DETALHES POR RAT:
${rats.map((rat, i) => {
  const status = i < results.successful ? '✅' : '❌';
  return `  ${status} RAT #${rat.report_number} - Cliente: ${rat.client_name}
        Técnico ID: ${rat.technician_id}
        Data de Abertura: ${rat.opening_date}
        Data de Criação: ${rat.created_at}
        Status: ${rat.status}`;
}).join('\n\n')}

═══════════════════════════════════════════════════════════════
  Próximos passos:
  1. Verifique os arquivos em: ${PDFS_DIR}
  2. Se houver falhas, tente rodar o script novamente
  3. Considere integrar os PDFs ao sistema local
═══════════════════════════════════════════════════════════════
  `;
  
  fs.writeFileSync(reportPath, report);
  console.log(`\n📄 Relatório salvo em: ${reportPath}`);
}

/**
 * Função principal
 */
async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   SCRIPT DE DOWNLOAD DE PDFs DO REPLIT - ASTEC            ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  let client;
  
  try {
    // Conectar ao Replit
    client = await connectDB(REPLIT_DB);
    
    // Buscar RATs pendentes
    const rats = await getPendingRATs(client);
    
    if (rats.length === 0) {
      console.log('\n✅ Nenhuma RAT com PDF pendente para download.');
      return;
    }
    
    // Download dos PDFs
    const results = await downloadPDFs(client, rats);
    
    // Gerar relatório
    generateReport(rats, results);
    
    console.log(`\n✅ Processo concluído!`);
    console.log(`  • Sucessos: ${results.successful}`);
    console.log(`  • Falhas: ${results.failed}`);
    
  } catch (err) {
    console.error('\n❌ Erro fatal:', err);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Conexão encerrada');
    }
  }
}

await main();
