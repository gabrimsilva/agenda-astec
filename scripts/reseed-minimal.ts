/**
 * Script para recriar dados mínimos após limpar o banco
 * Mantém usuários e recria apenas activity types
 */

import { seedActivityTypes } from "../server/seed";

async function reseedMinimal() {
  console.log("🌱 Reseeding minimal data...\n");
  
  try {
    // Reseed apenas activity types
    await seedActivityTypes();
    
    console.log("\n✅ Minimal reseed completed successfully!");
    console.log("📊 Database state:");
    console.log("   - Users: Preserved");
    console.log("   - Technicians: Preserved");
    console.log("   - Activity Types: 9 types reseeded");
    console.log("   - Everything else: Cleared");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error reseeding:", error);
    process.exit(1);
  }
}

reseedMinimal();
