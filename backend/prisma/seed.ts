import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // ── Companies ──────────────────────────────────────────────
  const defaultCompany = await prisma.company.upsert({
    where: { slug: 'default-company' },
    update: {},
    create: {
      name: 'Default Company',
      slug: 'default-company',
      isActive: true,
    },
  });
  console.log(`✅ Company created: ${defaultCompany.name}`);

  const nutresaCompany = await prisma.company.upsert({
    where: { slug: 'nutresa' },
    update: {},
    create: {
      name: 'Nutresa',
      slug: 'nutresa',
      isActive: true,
    },
  });
  console.log(`✅ Company created: ${nutresaCompany.name}`);

  const cocaColaCompany = await prisma.company.upsert({
    where: { slug: 'coca-cola' },
    update: {},
    create: {
      name: 'Coca-Cola',
      slug: 'coca-cola',
      isActive: true,
    },
  });
  console.log(`✅ Company created: ${cocaColaCompany.name}`);

  // ── Assign existing campaigns to companies ─────────────────
  const allCampaigns = await prisma.campaign.findMany({
    where: { companyId: null },
  });

  for (const campaign of allCampaigns) {
    let targetCompanyId = defaultCompany.id;
    
    if (campaign.slug.includes('nutresa')) {
      targetCompanyId = nutresaCompany.id;
    } else if (campaign.slug.includes('coca-cola') || campaign.name.toLowerCase().includes('coca-cola')) {
      targetCompanyId = cocaColaCompany.id;
    }

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { companyId: targetCompanyId },
    });
    console.log(`✅ Campaign "${campaign.name}" assigned to company`);
  }

  // ── Role: ADMIN ────────────────────────────────────────────
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'Administrador general de GiftApp. Acceso completo.',
    },
  });
  console.log(`✅ Role created: ${adminRole.name}`);

  // ── Role: SUPER_ADMIN ──────────────────────────────────────
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: {
      name: 'SUPER_ADMIN',
      description: 'Super administrador. Acceso total y gestión de admins.',
    },
  });
  console.log('✅ Role created: SUPER_ADMIN');

  // ── Role: COMPANY_VIEWER ───────────────────────────────────
  const companyViewerRole = await prisma.role.upsert({
    where: { name: 'COMPANY_VIEWER' },
    update: {},
    create: {
      name: 'COMPANY_VIEWER',
      description: 'Visualizador de compañía. Acceso de solo lectura a datos de su compañía.',
    },
  });
  console.log('✅ Role created: COMPANY_VIEWER');

  // ── Admin User (SUPER_ADMIN) ───────────────────────────────
  const seedEmail = process.env.ADMIN_SEED_EMAIL || 'admin@giftapp.com';
  const seedPassword = process.env.ADMIN_SEED_PASSWORD || 'Admin123!';
  const hashedPassword = await bcrypt.hash(seedPassword, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email: seedEmail },
    update: {
      roleId: superAdminRole.id,
      companyId: null,
    },
    create: {
      name: 'Super Admin',
      email: seedEmail,
      password: hashedPassword,
      roleId: superAdminRole.id,
      companyId: null,
      isActive: true,
    },
  });
  console.log(`✅ Admin user created: ${admin.email} (SUPER_ADMIN)`);

  // ── Company Viewer User (Nutresa) ──────────────────────────
  const viewerEmail = 'viewer@nutresa.com';
  const viewerPassword = 'Viewer123!';
  const hashedViewerPassword = await bcrypt.hash(viewerPassword, 12);

  const viewer = await prisma.adminUser.upsert({
    where: { email: viewerEmail },
    update: {},
    create: {
      name: 'Nutresa Viewer',
      email: viewerEmail,
      password: hashedViewerPassword,
      roleId: companyViewerRole.id,
      companyId: nutresaCompany.id,
      isActive: true,
    },
  });
  console.log(`✅ Company viewer created: ${viewer.email} (COMPANY_VIEWER - Nutresa)`);

  console.log('\n🎉 Seed completed.\n');
  console.log('   Login credentials:');
  console.log(`   SUPER_ADMIN:    ${seedEmail} / ${seedPassword}`);
  console.log(`   COMPANY_VIEWER: ${viewerEmail} / ${viewerPassword}\n`);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
