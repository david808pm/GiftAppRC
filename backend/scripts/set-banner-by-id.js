const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const id = 7;
const url = 'https://imgs.search.brave.com/JnXiz4PU3Cy52zxVhKhXO6VFB_AjAgCoSQDz_mv99kw/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly90aHVt/YnMuZHJlYW1zdGlt/ZS5jb20vYi9jb2Nh/LWNvbGEtYmFubmVy/LWxvZ28tc2xvZ2Fu/LXN1cGVybWFya2V0/LW5vdmktc2FkLXNl/cmJpYS1tYXktMjgx/MDMyMTc3LmpwZw';

async function run(){
  try{
    console.log('Attempting update via Prisma...');
    await prisma.campaign.update({ where: { id }, data: { bannerImageUrl: url } });
    console.log('Campaign updated with bannerImageUrl.');
  }catch(e){
    console.error('Update failed:', e.code || e.message || e);
    if(e && e.code === 'P2022'){
      console.log('Detected P2022; adding columns via raw SQL and retrying...');
      try{
        await prisma.$executeRawUnsafe('ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "bannerImageUrl" varchar(500);');
      }catch(alterErr){
        console.error('Failed to add bannerImageUrl:', alterErr);
      }
      try{
        await prisma.$executeRawUnsafe('ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "bannerDecoration" jsonb;');
      }catch(alterErr){
        console.error('Failed to add bannerDecoration:', alterErr);
      }

      try{
        await prisma.campaign.update({ where: { id }, data: { bannerImageUrl: url } });
        console.log('Campaign updated after adding columns.');
      }catch(finalErr){
        console.error('Final update failed:', finalErr);
      }
    }
  }finally{
    await prisma.$disconnect();
  }
}

run().catch(async (e)=>{ console.error('Unexpected error', e); await prisma.$disconnect(); process.exit(1); });
