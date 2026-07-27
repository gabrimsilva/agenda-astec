/**
 * Script para excluir atividades concluídas antigas (até 23/02/2026) que não têm RAT
 * 
 * Execute com: node delete-old-activities.js
 */

import { db } from './server/db.js';
import { activities, rats } from './shared/schema.js';
import { eq, and, lte, sql } from 'drizzle-orm';

async function deleteOldActivitiesWithoutRat() {
  try {
    console.log('🔍 Buscando atividades antigas sem RAT (até 23/02/2026)...\n');
    
    // Primeiro, buscar as atividades que serão excluídas
    const oldActivities = await db
      .select({
        id: activities.id,
        clientName: activities.clientName,
        scheduledDate: activities.scheduledDate,
        status: activities.status,
      })
      .from(activities)
      .leftJoin(rats, eq(activities.id, rats.activityId))
      .where(
        and(
          eq(activities.status, 'concluido'),
          eq(activities.workCompleted, true),
          lte(activities.scheduledDate, new Date('2026-02-23T23:59:59')),
          sql`${rats.id} IS NULL` // Não tem RAT associada
        )
      );
    
    if (oldActivities.length === 0) {
      console.log('✅ Nenhuma atividade antiga sem RAT encontrada.');
      process.exit(0);
    }
    
    console.log(`📋 Encontradas ${oldActivities.length} atividades para excluir:\n`);
    oldActivities.forEach((act, index) => {
      const date = new Date(act.scheduledDate);
      console.log(`${index + 1}. ${act.clientName} - ${date.toLocaleDateString('pt-BR')} (ID: ${act.id})`);
    });
    
    console.log('\n⚠️  ATENÇÃO: Esta operação é IRREVERSÍVEL!\n');
    console.log('Se deseja continuar, edite este arquivo e descomente a seção de DELETE.\n');
    
    // ============================================================
    // DESCOMENTE AS LINHAS ABAIXO PARA EXECUTAR A EXCLUSÃO
    // ============================================================
    
    // const activityIds = oldActivities.map(a => a.id);
    // 
    // console.log('🗑️  Excluindo atividades...\n');
    // 
    // const result = await db
    //   .delete(activities)
    //   .where(
    //     and(
    //       eq(activities.status, 'concluido'),
    //       eq(activities.workCompleted, true),
    //       lte(activities.scheduledDate, new Date('2026-02-23T23:59:59'))
    //     )
    //   );
    // 
    // console.log(`✅ ${oldActivities.length} atividades excluídas com sucesso!`);
    // console.log('\n⚠️  Lembre-se de limpar o cache do navegador (Ctrl+Shift+R)');
    
  } catch (error) {
    console.error('❌ Erro ao excluir atividades:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

deleteOldActivitiesWithoutRat();
