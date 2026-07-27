// Verificar tipo da RAT (simplificada ou completa)
import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = 'postgresql://astec:astec@db:5432/astec';

async function checkRatType() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados\n');
    
    // Buscar RAT e verificar campos preenchidos
    const result = await client.query(`
      SELECT 
        r.report_number,
        r.status,
        r.client_name,
        r.form_data,
        r.imported_pdf_url,
        LENGTH(r.form_data::text) as form_data_length,
        r.technician_signature,
        r.project_type,
        r.surface_maintenance_grade,
        r.application_note
      FROM rats r
      WHERE r.report_number = 'RAT-2026-0390'
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ RAT não encontrada');
      return;
    }
    
    const rat = result.rows[0];
    
    console.log('📋 ANÁLISE DO TIPO DA RAT RAT-2026-0390:\n');
    console.log(`Número: ${rat.report_number}`);
    console.log(`Status: ${rat.status}`);
    console.log(`Cliente: ${rat.client_name}`);
    console.log(`\n--- INDICADORES DE TIPO ---`);
    
    // Verificar se é PDF importado
    const isPdfImported = !!rat.imported_pdf_url;
    console.log(`1. PDF Importado: ${isPdfImported ? 'SIM (RAT tipo PDF)' : 'NÃO'}`);
    
    // Verificar tamanho do form_data
    const hasFormData = rat.form_data && rat.form_data_length > 10;
    console.log(`2. Tem dados de formulário: ${hasFormData ? 'SIM' : 'NÃO'}`);
    console.log(`   Tamanho: ${rat.form_data_length} caracteres`);
    
    // Verificar campos específicos de RAT completa
    const hasSignature = !!rat.technician_signature;
    const hasProjectType = !!rat.project_type;
    const hasSurfaceGrade = rat.surface_maintenance_grade !== null;
    const hasApplicationNote = !!rat.application_note;
    
    console.log(`3. Assinatura do técnico: ${hasSignature ? 'SIM' : 'NÃO'}`);
    console.log(`4. Tipo de projeto: ${hasProjectType ? rat.project_type : 'NÃO'}`);
    console.log(`5. Grau de manutenção: ${hasSurfaceGrade ? rat.surface_maintenance_grade : 'NÃO'}`);
    console.log(`6. Nota de aplicação: ${hasApplicationNote ? 'SIM' : 'NÃO'}`);
    
    // Analisar form_data se existir
    if (hasFormData) {
      try {
        const formData = JSON.parse(rat.form_data);
        const keys = Object.keys(formData);
        console.log(`\n7. Campos no formulário: ${keys.length}`);
        
        // Campos típicos de RAT simplificada
        const simplifiedFields = ['observacoes', 'cliente', 'data'];
        const hasSimplifiedFields = simplifiedFields.some(f => keys.includes(f));
        
        // Campos típicos de RAT completa
        const completeFields = ['produtos', 'aplicacao', 'preparo_superficie', 'equipamentos'];
        const hasCompleteFields = completeFields.some(f => keys.includes(f));
        
        console.log(`   Campos de RAT simplificada: ${hasSimplifiedFields ? 'SIM' : 'NÃO'}`);
        console.log(`   Campos de RAT completa: ${hasCompleteFields ? 'SIM' : 'NÃO'}`);
        
        // Mostrar alguns campos
        console.log(`\n   Campos encontrados (primeiros 10):`);
        keys.slice(0, 10).forEach(key => {
          const value = formData[key];
          const preview = typeof value === 'string' ? value.substring(0, 50) : JSON.stringify(value).substring(0, 50);
          console.log(`     - ${key}: ${preview}...`);
        });
      } catch (e) {
        console.log(`   ⚠️  Erro ao parsear form_data: ${e.message}`);
      }
    }
    
    // CONCLUSÃO
    console.log(`\n========================================`);
    console.log(`CONCLUSÃO:`);
    
    if (isPdfImported) {
      console.log(`✅ RAT do tipo: PDF IMPORTADO`);
    } else if (hasFormData && rat.form_data_length > 100) {
      console.log(`✅ RAT do tipo: COMPLETA (Formulário detalhado)`);
    } else if (hasFormData && rat.form_data_length <= 100) {
      console.log(`✅ RAT do tipo: SIMPLIFICADA (Formulário básico)`);
    } else {
      console.log(`⚠️  RAT do tipo: INDEFINIDO (sem dados)`);
    }
    console.log(`========================================\n`);
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkRatType();
