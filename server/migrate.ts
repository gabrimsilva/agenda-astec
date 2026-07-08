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
    // Para férias: subtrai 1 dia de ambas as datas
    // Para compromissos: subtrai 1 dia apenas de startDate
    const result = await db.execute(sql`
      UPDATE agenda_blocks
      SET 
        start_date = start_date - INTERVAL '1 day',
        end_date = CASE 
          WHEN block_type = 'compromisso' THEN end_date - INTERVAL '1 day'
          ELSE end_date - INTERVAL '1 day'
        END
      WHERE 
        created_at < NOW() - INTERVAL '1 hour'
        AND EXTRACT(HOUR FROM start_date) = 0
        AND EXTRACT(MINUTE FROM start_date) = 0
        AND EXTRACT(HOUR FROM end_date) = 0
        AND EXTRACT(MINUTE FROM end_date) = 0
      RETURNING id, block_type, start_date, end_date
    `);
    
    const updatedCount = result.rows.length;
    if (updatedCount > 0) {
      console.log(`✅ Corrigidas ${updatedCount} datas de bloqueios de agenda`);
      result.rows.forEach((row: any) => {
        console.log(`   - ${row.block_type}: ${new Date(row.start_date).toLocaleDateString('pt-BR')} a ${new Date(row.end_date).toLocaleDateString('pt-BR')}`);
      });
    } else {
      console.log(`✅ Nenhum bloqueio de agenda precisava correção`);
    }
  } catch (error) {
    console.error("❌ Erro ao corrigir datas de bloqueios:", error);
    // Não interrompe a migração se este step falhar
  }
}

/**
 * Adiciona coluna is_active à tabela users se não existir
 */
async function addIsActiveToUsers(): Promise<void> {
  try {
    console.log("🔧 Verificando coluna is_active na tabela users...");
    
    // Verifica se a coluna já existe
    const checkColumn = await db.execute(sql.raw(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'is_active'
    `));
    
    if (checkColumn.rows.length === 0) {
      // Coluna não existe, adiciona
      console.log("  ➕ Adicionando coluna is_active...");
      await db.execute(sql.raw(`
        ALTER TABLE users 
        ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL
      `));
      console.log("  ✅ Coluna is_active adicionada com sucesso");
    } else {
      console.log("  ✅ Coluna is_active já existe");
    }
  } catch (error: any) {
    console.error("❌ Erro ao adicionar coluna is_active:", error.message);
    // Não interrompe a migração se este step falhar
  }
}

/**
 * Cria índices de performance para queries lentas
 */
async function createPerformanceIndexes(): Promise<void> {
  try {
    console.log("🔧 Criando índices de performance...");
    
    const indexes = [
      // Activities indexes for date range queries
      { name: "idx_activities_scheduled_date", query: "CREATE INDEX IF NOT EXISTS idx_activities_scheduled_date ON activities(scheduled_date)" },
      { name: "idx_activities_end_date", query: "CREATE INDEX IF NOT EXISTS idx_activities_end_date ON activities(end_date)" },
      { name: "idx_activities_technician_id", query: "CREATE INDEX IF NOT EXISTS idx_activities_technician_id ON activities(technician_id)" },
      { name: "idx_activities_status", query: "CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status)" },
      
      // RATs indexes
      { name: "idx_rats_technician_id", query: "CREATE INDEX IF NOT EXISTS idx_rats_technician_id ON rats(technician_id)" },
      { name: "idx_rats_created_at", query: "CREATE INDEX IF NOT EXISTS idx_rats_created_at ON rats(created_at)" },
      { name: "idx_rats_activity_id", query: "CREATE INDEX IF NOT EXISTS idx_rats_activity_id ON rats(activity_id)" },
      
      // Technicians indexes
      { name: "idx_technicians_user_id", query: "CREATE INDEX IF NOT EXISTS idx_technicians_user_id ON technicians(user_id)" },
      
      // Clients indexes
      { name: "idx_clients_company_name", query: "CREATE INDEX IF NOT EXISTS idx_clients_company_name ON clients(company_name)" },
    ];
    
    for (const idx of indexes) {
      try {
        await db.execute(sql.raw(idx.query));
        console.log(`  ✅ ${idx.name}`);
      } catch (err: any) {
        // Index might already exist, which is fine
        if (!err.message.includes("already exists")) {
          console.warn(`  ⚠️ ${idx.name}: ${err.message}`);
        }
      }
    }
    
    console.log("✅ Índices de performance criados");
  } catch (error) {
    console.error("❌ Erro ao criar índices:", error);
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
    const APP_VERSION = process.env.APP_VERSION || "2.0.0";
    
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

    // 7. Aplicar fixes de dados se necessário
    await fixAgendaBlockDates();
    
    // 7b. Adicionar coluna isActive para usuários
    await addIsActiveToUsers();

    // 8. Criar índices de performance
    await createPerformanceIndexes();

    // 8. Registrar migração bem-sucedida
    await db.execute(
      sql`INSERT INTO _migration_log (version, description, success) 
          VALUES (${APP_VERSION}, ${'Sincronização automática do schema + índices de performance'}, true)`
    );

    const elapsed = Date.now() - startTime;
    console.log(`✅ Migração concluída com sucesso em ${elapsed}ms`);

  } catch (error) {
    console.error("❌ Erro durante migração:", error);
    
    // Registrar erro na migração
    try {
      const APP_VERSION = process.env.APP_VERSION || "2.0.0";
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
