-- Atualizar RAT-2026-0334 com dados do Replit
UPDATE rats 
SET form_data = '{"reportNumberManual":"PAS 0028-26","openingDate":"2026-06-16","closingDate":"2026-06-16","clientNameEditable":"A.M.C SOARES MOVEIS","projectType":"nova","applicationNote":"","serviceType":["rc"],"obraName":"N/A","applicator":"O mesmo","contact":"(11) 98241-7407","email":"N/I","sector":"Pintura","segment":["powder"],"substrate":"Aço","initialGrade":"N/A","surfacePrep":"Limpeza manual com Thinner","abrasiveType":"N/A","roughness":"N/A","aggressiveness":"N/A","product":{"description":"PTN 008","color":"PRETO MICROTEXTURA"},"application":{"totalThickness":"60 a 90","finish":"60  a 90"},"objective":"Prestar suporte técnico ao cliente quanto à reclamação do item mencionado, abordando divergência de aspecto.","participants":"Pedro Silveira - Assistência Técnica Renner Coatings.\\nEquipe de pintura A.M.C","activitiesPerformed":"Durante o acompanhamento, foi realizada a aplicação do lote reclamado. Após ajustes nos parâmetros de aplicação e nas condições de cura da estufa, observou-se uma melhora significativa no aspecto final do produto. Adicionalmente, foi aplicada uma amostra de 1 kg do produto PTN 001 para avaliação do cliente.","comments":"N/A","conclusion":"Após os testes, o cliente aprovou o produto PTN 001, informando que passará a utilizá-lo nos próximos pedidos. Em relação ao lote reclamado do produto PTN 008, considerando a melhoria obtida após os ajustes de processo, o cliente optou por utilizar o material atualmente disponível em estoque.\\n","components":[]}'::jsonb
WHERE id = '42a30a3f-ed3c-45c6-afb6-b2763581da9e';

-- Verificar atualização
SELECT 
  'RAT RECUPERADA!' as status,
  report_number,
  client_name,
  LENGTH(form_data::text) as tamanho_dados,
  CASE WHEN form_data IS NULL THEN 'NULL'
       WHEN form_data = '{}' THEN 'VAZIO'
       ELSE 'COM DADOS' END as status_form
FROM rats
WHERE id = '42a30a3f-ed3c-45c6-afb6-b2763581da9e';
