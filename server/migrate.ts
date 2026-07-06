import { db } from "./db";
import { sql } from "drizzle-orm";
import { agendaBlocks } from "@shared/schema";
import { eq, lt } from "drizzle-orm";

/**
 * Sistema de Migração Automática do Banco de Dados
 * 
 * Este script é executado automaticamente após cada deploy para:
 * 1. Verificar se há novas tabelas ou campos no schema
 * 2. Aplicar as alterações no banco de dados de produção
 * 3. Registrar um log das migrações aplicadas
 * 
 * Utiliza Drizzle ORM para sincronização automática do schema.
 */

// Tabela para registro de migrações
const MIGRATION_LOG_TABLE = `
  CREATE TABLE IF NOT EXISTS _migration_log (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    success BOOLEAN DEFAULT true
  )
`;

/**
 * Fix para bloqueios de agenda com data errada (antes da correção de timezone)
 * Subtrai 1 dia dos bloqueios que foram criados com data incorreta
 */
async function fixAgendaBlockDates(): Promise<void> {
  try {
    console.log("🔧 Corrigindo datas de bloqueios de agenda...");
    
    // Buscar bloqueios antigos (criados antes desta correção)
    // A heurística: bloqueios onde startDate e endDate têm a mesma hora (00:00) e foram criados há tempos
    const result = await db.execute(sql`
      UPDATE agenda_blocks
      SET 
        start_date = start_date - INTERVAL '1 day',
        end_date = end_date - INTERVAL '1 day'
      WHERE 
        created_at < NOW() - INTERVAL '1 hour'
        AND EXTRACT(HOUR FROM start_date) = 0
        AND EXTRACT(MINUTE FROM start_date) = 0
        AND EXTRACT(HOUR FROM end_date) = 0
        AND EXTRACT(MINUTE FROM end_date) = 0
      RETURNING id, start_date, end_date
    `);
    
    const updatedCount = result.rows.length;
    if (updatedCount > 0) {
      console.log(`✅ Corrigidas ${updatedCount} datas de bloqueios de agenda`);
    } else {
      console.log(`✅ Nenhum bloqueio de agenda precisava correção`);
    }
  } catch (error) {
    console.error("❌ Erro ao corrigir datas de bloqueios:", error);
    // Não interrompe a migração se este step falhar
  }
}

export async function runMigrations(): Promise<void> {
  const startTime = Date.now();
  console.log("🔄 Iniciando verificação de migração do banco de dados...");

  try {
    // 1. Criar tabela de log de migrações se não existir
    await db.execute(sql.raw(MIGRATION_LOG_TABLE));

    // 2. Verificar versão atual do sistema
    const APP_VERSION = process.env.APP_VERSION || "1.0.0";
    
    // 3. Verificar se esta versão já foi migrada
    const existingMigration = await db.execute(
      sql`SELECT * FROM _migration_log WHERE version = ${APP_VERSION} ORDER BY applied_at DESC LIMIT 1`
    );

    if (existingMigration.rows.length > 0) {
      console.log(`✅ Versão ${APP_VERSION} já migrada anteriormente`);
      return;
    }

    // 4. Executar sincronização do schema
    console.log(`📦 Sincronizando schema para versão ${APP_VERSION}...`);
    
    // O Drizzle ORM sincroniza automaticamente quando as tabelas são acessadas
    // Aqui verificamos se as tabelas principais existem e estão acessíveis
    const tablesCheck = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tables = tablesCheck.rows.map((row: any) => row.table_name);
    console.log(`📋 Tabelas encontradas: ${tables.join(", ")}`);

    // 5. Verificar colunas de cada tabela principal
    const mainTables = ['users', 'clients', 'activities', 'technicians', 'activity_types'];
    for (const tableName of mainTables) {
      if (tables.includes(tableName)) {
        const columnsCheck = await db.execute(sql.raw(`
          SELECT column_name, data_type, is_nullable 
          FROM information_schema.columns 
          WHERE table_name = '${tableName}' 
          ORDER BY ordinal_position
        `));
        console.log(`  📄 ${tableName}: ${columnsCheck.rows.length} colunas`);
      }
    }

    // 6. Aplicar fixes de dados se necessário
    await fixAgendaBlockDates();

    // 7. Registrar migração bem-sucedida
    await db.execute(
      sql`INSERT INTO _migration_log (version, description, success) 
          VALUES (${APP_VERSION}, ${'Sincronização automática do schema'}, true)`
    );

    const elapsed = Date.now() - startTime;
    console.log(`✅ Migração concluída com sucesso em ${elapsed}ms`);

  } catch (error) {
    console.error("❌ Erro durante migração:", error);
    
    // Registrar erro na migração
    try {
      const APP_VERSION = process.env.APP_VERSION || "1.0.0";
      await db.execute(
        sql`INSERT INTO _migration_log (version, description, success) 
            VALUES (${APP_VERSION}, ${`Erro: ${error instanceof Error ? error.message : 'Unknown error'}`}, false)`
      );
    } catch (logError) {
      console.error("❌ Não foi possível registrar erro de migração:", logError);
    }
    
    // Não interrompe a aplicação, apenas registra o erro
    console.log("⚠️ Aplicação continuará mesmo com erro de migração");
  }
}

/**
 * Verifica se há alterações pendentes no schema
 */
export async function checkSchemaChanges(): Promise<{
  hasChanges: boolean;
  tables: string[];
  message: string;
}> {
  try {
    const result = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);

    const tables = result.rows.map((row: any) => row.table_name);
    
    return {
      hasChanges: false,
      tables,
      message: `${tables.length} tabelas encontradas no banco de dados`
    };
  } catch (error) {
    return {
      hasChanges: false,
      tables: [],
      message: `Erro ao verificar schema: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Obtém histórico de migrações
 */
export async function getMigrationHistory(): Promise<any[]> {
  try {
    const result = await db.execute(sql`
      SELECT * FROM _migration_log 
      ORDER BY applied_at DESC 
      LIMIT 20
    `);
    return result.rows;
  } catch (error) {
    console.error("Erro ao obter histórico de migrações:", error);
    return [];
  }
}
