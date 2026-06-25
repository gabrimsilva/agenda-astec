import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function resetPassword() {
  try {
    const hashedPassword = await bcrypt.hash('gps123', 10);
    
    const result = await db.update(users)
      .set({ password: hashedPassword })
      .where(eq(users.email, 'teste.gps@rennercoatings.com'))
      .returning();

    if (result.length > 0) {
      console.log('✅ Senha resetada com sucesso!');
      console.log('📧 Email: teste.gps@rennercoatings.com');
      console.log('🔑 Nova senha: gps123');
    } else {
      console.log('❌ Usuário não encontrado');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao resetar senha:', error);
    process.exit(1);
  }
}

resetPassword();
