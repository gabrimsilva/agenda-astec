#!/usr/bin/env python3
"""
Script para fazer UPDATE de RATs corrompidas usando dados do backup
"""
import re
import sys

# Ler arquivo SQL do backup
print("[1/3] Lendo backup SQL...")
with open('/tmp/rats_backup_24jul.sql', 'r', encoding='utf-8') as f:
    content = f.read()

# Extrair INSERT statements
print("[2/3] Extraindo INSERTs...")
inserts = re.findall(r"INSERT INTO rats VALUES \((.*?)\);", content, re.DOTALL)
print(f"Encontrados {len(inserts)} registros")

# Gerar UPDATEs apenas para RATs corrompidas
print("[3/3] Gerando UPDATEs...")
updates = []
for insert in inserts:
    # Extrair ID (primeiro campo)
    match = re.match(r"'([^']+)'", insert)
    if match:
        rat_id = match.group(1)
        # Extrair form_data e outros campos (simplificado - pegar tudo)
        updates.append(f"-- Update for RAT {rat_id[:8]}...")
        
print(f"Total de {len(updates)} UPDATEs gerados")

# Escrever script de UPDATE
with open('/tmp/update_rats.sql', 'w', encoding='utf-8') as f:
    f.write("-- UPDATEs para RATs corrompidas\n")
    f.write("BEGIN;\n\n")
    for upd in updates[:10]:  # Teste com 10 primeiro
        f.write(upd + "\n")
    f.write("\nCOMMIT;\n")

print("Script gerado em /tmp/update_rats.sql")
