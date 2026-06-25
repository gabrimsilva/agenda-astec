import { db } from "../server/db";
import { users, technicians } from "../shared/schema";
import * as bcrypt from "bcrypt";

async function seedUser() {
  try {
    // Check if user already exists
    const existing = await db.select().from(users).limit(1);
    if (existing.length > 0) {
      console.log("ℹ️  Users already exist, skipping seed");
      process.exit(0);
    }

    // Create admin user
    const hashedPassword = await bcrypt.hash("admin123", 10);
    const [adminUser] = await db.insert(users).values({
      username: "admin",
      email: "admin@renner.com.br",
      password: hashedPassword,
      name: "Administrador",
      role: "admin",
    }).returning();

    console.log("✅ Admin user created:");
    console.log("   Username: admin");
    console.log("   Password: admin123");
    console.log("   Role: admin");

    // Create assistente user with technician profile
    const hashedPasswordTech = await bcrypt.hash("tech123", 10);
    const [techUser] = await db.insert(users).values({
      username: "carlos",
      email: "carlos.mendes@renner.com.br",
      password: hashedPasswordTech,
      name: "Carlos Mendes",
      role: "assistente",
    }).returning();

    const [technician] = await db.insert(technicians).values({
      userId: techUser.id,
      name: "Carlos Mendes",
      email: "carlos.mendes@renner.com.br",
      phone: "(51) 99999-1234",
      team: "Equipe Sul",
      baseCity: "Porto Alegre/RS",
      color: "hsl(220 65% 50%)",
      workHoursPerDay: 8,
    }).returning();

    console.log("\n✅ Technician user created:");
    console.log("   Username: carlos");
    console.log("   Password: tech123");
    console.log("   Role: assistente");
    console.log("   Team: Equipe Sul");

    console.log("\n🎉 Seed completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding user:", error);
    process.exit(1);
  }
}

seedUser();
