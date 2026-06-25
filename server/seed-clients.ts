import { db } from "./db";
import { clients, clientSites } from "@shared/schema";

const seedClients = [
  {
    companyName: "Renner Store Paulista",
    segment: "Varejo",
    group: "Renner",
    active: true,
    sites: [{
      siteName: "Loja Paulista",
      address: "Av. Paulista, 1000",
      city: "São Paulo",
      state: "SP",
      zipCode: "01310-100",
      latitude: "-23.5629",
      longitude: "-46.6544"
    }]
  },
  {
    companyName: "Indústria Química Ipiranga",
    segment: "Indústria Química",
    group: "Ipiranga",
    active: true,
    sites: [{
      siteName: "Fábrica Principal",
      address: "Av. Do Estado, 5533",
      city: "São Paulo",
      state: "SP",
      zipCode: "04273-000",
      latitude: "-23.5991",
      longitude: "-46.6297"
    }]
  },
  {
    companyName: "Shopping Morumbi",
    segment: "Varejo",
    group: "Shoppings",
    active: true,
    sites: [{
      siteName: "Shopping Morumbi",
      address: "Av. Roque Petroni Júnior, 1089",
      city: "São Paulo",
      state: "SP",
      zipCode: "04707-900",
      latitude: "-23.6237",
      longitude: "-46.6978"
    }]
  },
  {
    companyName: "Fábrica Têxtil Brás",
    segment: "Indústria Têxtil",
    group: "Têxtil SP",
    active: true,
    sites: [{
      siteName: "Unidade Brás",
      address: "Rua Oriente, 350",
      city: "São Paulo",
      state: "SP",
      zipCode: "03016-010",
      latitude: "-23.5426",
      longitude: "-46.6213"
    }]
  },
  {
    companyName: "Auto Center Tatuapé",
    segment: "Automotivo",
    group: "Auto Centers",
    active: true,
    sites: [{
      siteName: "Loja Tatuapé",
      address: "Rua Serra de Juréa, 661",
      city: "São Paulo",
      state: "SP",
      zipCode: "03323-000",
      latitude: "-23.5394",
      longitude: "-46.5714"
    }]
  },
  {
    companyName: "Metalúrgica Vila Mariana",
    segment: "Metalurgia",
    group: "Metal Works",
    active: true,
    sites: [{
      siteName: "Fábrica Vila Mariana",
      address: "Rua Domingos de Morais, 2564",
      city: "São Paulo",
      state: "SP",
      zipCode: "04035-001",
      latitude: "-23.5938",
      longitude: "-46.6386"
    }]
  },
  {
    companyName: "Hospital São Luiz",
    segment: "Saúde",
    group: "Hospitais",
    active: true,
    sites: [{
      siteName: "Unidade Morumbi",
      address: "Rua Dr. Alceu de Campos Rodrigues, 95",
      city: "São Paulo",
      state: "SP",
      zipCode: "04544-000",
      latitude: "-23.6156",
      longitude: "-46.6981"
    }]
  },
  {
    companyName: "Tech Park Offices",
    segment: "Tecnologia",
    group: "Tech Companies",
    active: true,
    sites: [{
      siteName: "Edifício Tech Park",
      address: "Av. Faria Lima, 3477",
      city: "São Paulo",
      state: "SP",
      zipCode: "04538-133",
      latitude: "-23.5871",
      longitude: "-46.6853"
    }]
  },
  {
    companyName: "Supermercado Zona Norte",
    segment: "Varejo Alimentício",
    group: "Supermercados",
    active: true,
    sites: [{
      siteName: "Loja Santana",
      address: "Av. Cruzeiro do Sul, 1000",
      city: "São Paulo",
      state: "SP",
      zipCode: "02031-000",
      latitude: "-23.5197",
      longitude: "-46.6282"
    }]
  },
  {
    companyName: "Universidade Mackenzie",
    segment: "Educação",
    group: "Universidades",
    active: true,
    sites: [{
      siteName: "Campus Higienópolis",
      address: "Rua da Consolação, 896",
      city: "São Paulo",
      state: "SP",
      zipCode: "01302-907",
      latitude: "-23.5468",
      longitude: "-46.6524"
    }]
  },
  {
    companyName: "Indústria de Alimentos Lapa",
    segment: "Indústria Alimentícia",
    group: "Alimentos",
    active: true,
    sites: [{
      siteName: "Fábrica Lapa",
      address: "Rua John Harrison, 275",
      city: "São Paulo",
      state: "SP",
      zipCode: "05089-000",
      latitude: "-23.5213",
      longitude: "-46.7116"
    }]
  },
  {
    companyName: "Construtora Brookfield",
    segment: "Construção Civil",
    group: "Construtoras",
    active: true,
    sites: [{
      siteName: "Escritório Itaim",
      address: "Av. Brigadeiro Faria Lima, 2055",
      city: "São Paulo",
      state: "SP",
      zipCode: "01452-001",
      latitude: "-23.5763",
      longitude: "-46.6827"
    }]
  },
  {
    companyName: "Farmácia São Paulo",
    segment: "Saúde",
    group: "Farmácias",
    active: true,
    sites: [{
      siteName: "Loja Centro",
      address: "Rua Barão de Itapetininga, 255",
      city: "São Paulo",
      state: "SP",
      zipCode: "01042-001",
      latitude: "-23.5456",
      longitude: "-46.6419"
    }]
  },
  {
    companyName: "Academia Smart Fit Liberdade",
    segment: "Fitness",
    group: "Academias",
    active: true,
    sites: [{
      siteName: "Unidade Liberdade",
      address: "Rua Galvão Bueno, 780",
      city: "São Paulo",
      state: "SP",
      zipCode: "01506-000",
      latitude: "-23.5603",
      longitude: "-46.6339"
    }]
  },
  {
    companyName: "Restaurante Varanda Grill",
    segment: "Alimentação",
    group: "Restaurantes",
    active: true,
    sites: [{
      siteName: "Unidade Jardins",
      address: "Rua Haddock Lobo, 1626",
      city: "São Paulo",
      state: "SP",
      zipCode: "01414-003",
      latitude: "-23.5639",
      longitude: "-46.6634"
    }]
  }
];

export async function runClientSeeds() {
  console.log("🌱 Starting client seeds...");

  try {
    for (const clientData of seedClients) {
      // Check if client already exists
      const existingClient = await db.query.clients.findFirst({
        where: (clients, { eq }) => eq(clients.companyName, clientData.companyName)
      });

      if (existingClient) {
        console.log(`⏭️  Client already exists: ${clientData.companyName}`);
        continue;
      }

      // Insert client
      const [newClient] = await db.insert(clients).values({
        companyName: clientData.companyName,
        segment: clientData.segment,
        group: clientData.group,
        active: clientData.active,
      }).returning();

      console.log(`✅ Created client: ${newClient.companyName}`);

      // Insert sites
      for (const siteData of clientData.sites) {
        await db.insert(clientSites).values({
          clientId: newClient.id,
          siteName: siteData.siteName,
          address: siteData.address,
          city: siteData.city,
          state: siteData.state,
          zipCode: siteData.zipCode,
          latitude: siteData.latitude,
          longitude: siteData.longitude,
        });

        console.log(`  ↳ Added site: ${siteData.siteName}`);
      }
    }

    console.log("✅ Client seeds completed successfully!");
  } catch (error) {
    console.error("❌ Error running client seeds:", error);
    throw error;
  }
}

// Run seeds if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runClientSeeds()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
