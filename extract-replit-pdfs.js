#!/usr/bin/env node

/**
 * Script para extrair e salvar PDFs embarcados do Replit
 * Os PDFs estão em formato data:application/pdf;base64 no banco
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDFS_DIR = path.join(__dirname, 'extracted_replit_pdfs');

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
 * Busca RATs com PDFs embarcados
 */
async function getPendingRATs(client) {
  console.log('\n🔍 Buscando RATs com PDFs embarcados...');
  
  try {
    const result = await client.query(`
      SELECT 
        id,
        report_number,
        client_name,
        technician_id,
        status,
        imported_pdf_filename,
        imported_pdf_url,
        opening_date,
        created_at
      FROM rats 
      WHERE imported_pdf_url IS NOT NULL 
        AND imported_pdf_url LIKE 'data:application/pdf%'
      ORDER BY created_at DESC 
      LIMIT 200
    `);
    
    console.log(`📊 Encontradas ${result.rows.length} RATs com PDFs embarcados`);
    return result.rows;
  } catch (err) {
    console.error('❌ Erro ao buscar RATs:', err.message);
    return [];
  }
}

/**
 * Extrai PDF de Data URI e salva em arquivo
 */
function extractAndSavePDF(dataUri, filename) {
  try {
    // Verificar se é um Data URI
    if (!dataUri.startsWith('data:application/pdf;base64,')) {
      throw new Error('URL não é um PDF base64');
    }
    
    // Extrair dados base64
    const base64Data = dataUri.replace('data:application/pdf;base64,', '');
    
    // Converter de base64 para buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Salvar arquivo
    fs.writeFileSync(filename, buffer);
    
    return buffer.length;
  } catch (err) {
    throw err;
  }
}

/**
 * Sanitiza nome de arquivo
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 200);
}

/**
 * Extrai PDFs e atualiza banco de dados
 */
async function extractPDFs(client, rats) {
  console.log(`\n💾 Extraindo ${rats.length} PDFs...\n`);
  
  let successful = 0;
  let failed = 0;
  const extractedFiles = [];
  
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
        successful++;
        continue;
      }
      
      console.log(`${progress} 💾 ${rat.report_number} - Extraindo...`);
      
      try {
        const sizeBytes = extractAndSavePDF(rat.imported_pdf_url, filepath);
        const sizeKB = (sizeBytes / 1024).toFixed(2);
        
        console.log(`${progress} ✅ ${rat.report_number} - Sucesso! (${sizeKB} KB)`);
        
        extractedFiles.push({
          rat_number: rat.report_number,
          filename: filename,
          filepath: filepath,
          size_kb: sizeKB
        });
        
        successful++;
      } catch (extractErr) {
        console.log(`${progress} ❌ ${rat.report_number} - Erro: ${extractErr.message}`);
        
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
  
  return { successful, failed, extractedFiles };
}

/**
 * Gera relatório detalhado
 */
function generateReport(rats, results) {
  const reportPath = path.join(PDFS_DIR, 'RELATORIO_EXTRACAO.txt');
  
  const totalSize = results.extractedFiles.reduce((sum, f) => sum + parseFloat(f.size_kb), 0);
  
  const report = `
╔════════════════════════════════════════════════════════════╗
║   RELATÓRIO DE EXTRAÇÃO DE PDFs DO REPLIT - ASTEC         ║
╚════════════════════════════════════════════════════════════╝

Data da Extração: ${new Date().toLocaleString('pt-BR')}

📊 RESUMO:
  • Total de RATs processadas: ${rats.length}
  • ✅ Extrações bem-sucedidas: ${results.successful}
  • ❌ Falhas: ${results.failed}
  • Taxa de sucesso: ${((results.successful / rats.length) * 100).toFixed(1)}%
  • Tamanho total: ${totalSize.toFixed(2)} MB

📁 LOCAL DE ARMAZENAMENTO:
  ${PDFS_DIR}

📋 ARQUIVOS EXTRAÍDOS (${results.extractedFiles.length}):
${results.extractedFiles.map((f, idx) => {
  return `  ${idx + 1}. ${f.rat_number}
        Arquivo: ${f.filename}
        Tamanho: ${f.size_kb} KB
        Caminho: ${f.filepath}`;
}).join('\n\n')}

═══════════════════════════════════════════════════════════════
  Próximos passos:
  1. Verifique os arquivos em: ${PDFS_DIR}
  2. Os caminhos foram salvos no banco de dados
  3. Integre os PDFs ao sistema local conforme necessário
  4. Para falhas, verifique o formato dos dados no Replit
═══════════════════════════════════════════════════════════════
  `;
  
  fs.writeFileSync(reportPath, report);
  console.log(`\n📄 Relatório salvo em: ${reportPath}`);
  
  // Também criar um JSON para processamento automatizado
  const jsonPath = path.join(PDFS_DIR, 'extracted_pdfs.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results.extractedFiles, null, 2));
  console.log(`📄 Índice JSON salvo em: ${jsonPath}`);
}

/**
 * Função principal
 */
async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   SCRIPT DE EXTRAÇÃO DE PDFs DO REPLIT - ASTEC            ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  let client;
  
  try {
    // Conectar ao Replit
    client = await connectDB(REPLIT_DB);
    
    // Buscar RATs pendentes
    const rats = await getPendingRATs(client);
    
    if (rats.length === 0) {
      console.log('\n✅ Nenhuma RAT com PDF embarcado para extrair.');
      return;
    }
    
    // Extrair PDFs
    const results = await extractPDFs(client, rats);
    
    // Gerar relatórios
    generateReport(rats, results);
    
    console.log(`\n✅ Processo concluído!`);
    console.log(`  • Sucessos: ${results.successful}`);
    console.log(`  • Falhas: ${results.failed}`);
    console.log(`  • Diretório: ${PDFS_DIR}`);
    
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
