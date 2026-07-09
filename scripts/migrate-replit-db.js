#!/usr/bin/env node

/**
 * Script para migrar dados do Replit para o banco local da VM
 * Evita duplicatas comparando chaves primárias
 */

import { Client } from 'pg';

// Connection strings
const REPLIT_DB = "postgresql://neondb_owner:npg_TEmNFius6W0n@ep-dark-credit-ae6dljaq.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require";
const LOCAL_DB = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/astec";

async function connectDB(connectionString, name) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log(`✅ Conectado ao banco ${name}`);
    return client;
  } catch (err) {
    console.error(`❌ Erro ao conectar ${name}:`, err.message);
    throw err;
  }
}

async function getTables(client) {
  const result = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  return result.rows.map(r => r.table_name);
}

async function getPrimaryKeyColumns(client, tableName) {
  const result = await client.query(`
    SELECT a.attname
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid
      AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = $1::regclass
    AND i.indisprimary;
  `, [tableName]);
  
  if (result.rows.length === 0) {
    // Se não houver PK, usar a primeira coluna
    const tableInfo = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 
      ORDER BY ordinal_position
      LIMIT 1;
    `, [tableName]);
    return tableInfo.rows.map(r => r.column_name);
  }
  
  return result.rows.map(r => r.attname);
}

async function getExistingIds(client, tableName, pkColumns) {
  if (pkColumns.length === 1) {
    const result = await client.query(
      `SELECT ${pkColumns[0]} FROM ${tableName}`
    );
    return new Set(result.rows.map(r => r[pkColumns[0]]));
  } else {
    // Para composite keys
    const result = await client.query(
      `SELECT ${pkColumns.join(', ')} FROM ${tableName}`
    );
    return new Set(result.rows.map(r => 
      pkColumns.map(col => r[col]).join('|')
    ));
  }
}

async function migrateTable(repClient, localClient, tableName) {
  console.log(`\n📋 Migrando tabela: ${tableName}`);
  
  try {
    // Obter colunas e PK
    const pkColumns = await getPrimaryKeyColumns(repClient, tableName);
    console.log(`  PK columns: ${pkColumns.join(', ')}`);
    
    // Obter IDs existentes no banco local
    const existingIds = await getExistingIds(localClient, tableName, pkColumns);
    console.log(`  Registros existentes no banco local: ${existingIds.size}`);
    
    // Obter dados do Replit
    const repData = await repClient.query(`SELECT * FROM ${tableName}`);
    console.log(`  Total de registros no Replit: ${repData.rows.length}`);
    
    // Filtrar registros novos (não existentes)
    const newRows = repData.rows.filter(row => {
      if (pkColumns.length === 1) {
        return !existingIds.has(row[pkColumns[0]]);
      } else {
        const key = pkColumns.map(col => row[col]).join('|');
        return !existingIds.has(key);
      }
    });
    
    console.log(`  Novos registros a importar: ${newRows.length}`);
    
    if (newRows.length === 0) {
      console.log(`  ✅ Nenhum novo registro para ${tableName}`);
      return 0;
    }
    
    // Inserir novos registros
    const columns = Object.keys(newRows[0]);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const insertQuery = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT DO NOTHING;
    `;
    
    let inserted = 0;
    for (const row of newRows) {
      const values = columns.map(col => row[col]);
      try {
        await localClient.query(insertQuery, values);
        inserted++;
      } catch (err) {
        console.log(`  ⚠️  Erro ao inserir registro em ${tableName}:`, err.message);
      }
    }
    
    console.log(`  ✅ Importados ${inserted} novos registros`);
    return inserted;
  } catch (err) {
    console.error(`  ❌ Erro ao migrar ${tableName}:`, err.message);
    return 0;
  }
}

async function main() {
  console.log('🚀 Iniciando migração de dados do Replit para VM local\n');
  
  let repClient, localClient;
  
  try {
    // Conectar aos bancos
    repClient = await connectDB(REPLIT_DB, 'Replit');
    localClient = await connectDB(LOCAL_DB, 'Local VM');
    
    // Obter tabelas
    console.log('\n📦 Obtendo lista de tabelas...');
    const tables = await getTables(repClient);
    console.log(`  Encontradas ${tables.length} tabelas`);
    
    // Ordem de migração (respeitando foreign keys)
    const migrationOrder = [
      'users',
      'technicians',
      'activity_types',
      'clients',
      'activities',
      'activity_day_statuses',
      'activity_time_records',
      'rats',
      'reschedule_history',
      'agenda_blocks',
    ];
    
    const orderedTables = migrationOrder.filter(t => tables.includes(t));
    const remainingTables = tables.filter(t => !migrationOrder.includes(t));
    
    let totalImported = 0;
    
    // Migrar tabelas na ordem correta
    for (const table of orderedTables) {
      const count = await migrateTable(repClient, localClient, table);
      totalImported += count;
    }
    
    // Migrar tabelas restantes
    for (const table of remainingTables) {
      const count = await migrateTable(repClient, localClient, table);
      totalImported += count;
    }
    
    console.log(`\n✅ Migração concluída! Total de registros importados: ${totalImported}`);
    
  } catch (err) {
    console.error('\n❌ Erro durante migração:', err);
    process.exit(1);
  } finally {
    if (repClient) await repClient.end();
    if (localClient) await localClient.end();
  }
}

await main();
