import { db } from "./db";
import { activityTypes, users, technicians } from "@shared/schema";
import { eq, notInArray } from "drizzle-orm";
import { hashPassword } from "./auth";

const REQUIRED_ACTIVITY_TYPES = [
  // Efetivo (Verde #22c55e) - 5 tipos
  {
    name: "Termografia",
    category: "efetivo" as const,
    color: "#22c55e",
    icon: "Thermometer",
    description: "Termografia",
    displayOrder: 1,
  },
  {
    name: "Visitas técnicas (Preventiva ou teste)",
    category: "efetivo" as const,
    color: "#22c55e",
    icon: "ClipboardCheck",
    description: "Visitas técnicas preventivas, inspeções e testes em campo",
    displayOrder: 2,
  },
  {
    name: "Treinamento técnico (Ministrante)",
    category: "efetivo" as const,
    color: "#22c55e",
    icon: "Presentation",
    description: "Treinamento técnico realizado",
    displayOrder: 3,
  },
  {
    name: "Especificações técnicas",
    category: "efetivo" as const,
    color: "#22c55e",
    icon: "FileText",
    description: "Elaboração de especificações técnicas e documentação de projetos",
    displayOrder: 4,
  },
  {
    name: "Visita técnica (corretiva ou RCs)",
    category: "efetivo" as const,
    color: "#22c55e",
    icon: "Wrench",
    description: "Visita técnica corretiva ou resolução de casos",
    displayOrder: 5,
  },

  // Adicional (Amarelo #eab308) - 4 tipos
  {
    name: "Suporte técnico à distância sem deslocamento",
    category: "adicional" as const,
    color: "#eab308",
    icon: "Headphones",
    description: "Suporte técnico remoto por telefone, email ou videoconferência",
    displayOrder: 6,
  },
  {
    name: "Documentação (Sistema da qualidade)",
    category: "adicional" as const,
    color: "#eab308",
    icon: "FileEdit",
    description: "Elaboração de RATs, RADs, checklists, organização de agenda e carta técnica",
    displayOrder: 7,
  },
  {
    name: "Treinamentos (Aluno)",
    category: "adicional" as const,
    color: "#eab308",
    icon: "GraduationCap",
    description: "Participação em treinamentos internos/externos como aluno",
    displayOrder: 8,
  },
  {
    name: "Tempo de trajeto ao cliente (planejado, inevitável ou necessário)",
    category: "adicional" as const,
    color: "#eab308",
    icon: "Car",
    description: "Tempo de deslocamento inevitável e planejado",
    displayOrder: 9,
  },

  // Perda (Vermelho #ef4444) - 2 tipos
  {
    name: "Tempo de deslocamento ate o cliente (Excessivo, Mal planejado, ou evitável)",
    category: "perda" as const,
    color: "#ef4444",
    icon: "AlertTriangle",
    description: "Tempo de trajeto até o cliente - inevitável, planejado ou necessário (calculado automaticamente)",
    displayOrder: 10,
    isAutomatic: true,
  },
  {
    name: "Aguardar Cliente",
    category: "perda" as const,
    color: "#ef4444",
    icon: "Clock",
    description: "Tempo de espera por cliente, materiais, liberações ou integração",
    displayOrder: 11,
  },
];

export async function seedActivityTypes() {
  try {
    console.log("🔄 Sincronizando tipos de atividade...");
    
    const requiredNames = REQUIRED_ACTIVITY_TYPES.map(t => t.name);
    
    // 1. Buscar tipos existentes
    const existingTypes = await db.select().from(activityTypes);
    const existingNames = existingTypes.map(t => t.name);
    
    // 2. Inserir tipos que não existem
    for (const requiredType of REQUIRED_ACTIVITY_TYPES) {
      const exists = existingTypes.find(t => t.name === requiredType.name);
      
      if (!exists) {
        await db.insert(activityTypes).values(requiredType);
        console.log(`  ✅ Criado: ${requiredType.name}`);
      } else {
        // Atualizar tipo existente para garantir configuração correta
        await db.update(activityTypes)
          .set({
            category: requiredType.category,
            color: requiredType.color,
            icon: requiredType.icon,
            description: requiredType.description,
            displayOrder: requiredType.displayOrder,
            isAutomatic: requiredType.isAutomatic || false,
          })
          .where(eq(activityTypes.name, requiredType.name));
      }
    }
    
    // 3. Identificar tipos extras que não deveriam existir
    const extraTypes = existingTypes.filter(t => !requiredNames.includes(t.name));
    
    if (extraTypes.length > 0) {
      console.log(`  ⚠️  Encontrados ${extraTypes.length} tipos extras não configurados:`);
      for (const extra of extraTypes) {
        console.log(`     - "${extra.name}" (${extra.category})`);
      }
      console.log(`  ℹ️  Para remover tipos extras, delete-os manualmente ou via SQL`);
    }
    
    console.log(`✅ Tipos de atividade sincronizados (${REQUIRED_ACTIVITY_TYPES.length} tipos obrigatórios)`);
    
  } catch (error) {
    console.error("❌ Error seeding activity types:", error);
    throw error;
  }
}

export async function seedDefaultAdmin() {
  try {
    const [existingAdmin] = await db
      .select()
      .from(users)
      .where(eq(users.email, "admin@astec.com"));
    
    if (!existingAdmin) {
      const hashedPassword = await hashPassword("admin123");
      
      const [adminUser] = await db
        .insert(users)
        .values({
          email: "admin@astec.com",
          password: hashedPassword,
          name: "Administrador",
          role: "admin",
        })
        .returning();
      
      await db
        .insert(technicians)
        .values({
          userId: adminUser.id,
          name: "Administrador",
          email: "admin@astec.com",
          phone: "(11) 99999-9999",
          team: "Administração",
          baseCity: "São Paulo",
          color: "#3b82f6",
        });
      
      console.log("✅ Default admin user seeded successfully (admin@astec.com)");
    } else {
      console.log("ℹ️  Default admin already exists, skipping seed");
    }
  } catch (error) {
    console.error("❌ Error seeding default admin:", error);
    throw error;
  }
}
