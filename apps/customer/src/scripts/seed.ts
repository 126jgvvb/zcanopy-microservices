import { DataSource } from 'typeorm';
import { CustomerEntity } from '../app/entity/customer.entity';
import { CustomerOtpEntity } from '../app/entity/customer-otp.entity';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'customer_db',
  entities: [CustomerEntity, CustomerOtpEntity],
  synchronize: false,
});

async function main() {
  await dataSource.initialize();

  const otpRepo = dataSource.getRepository(CustomerOtpEntity);
  const customerRepo = dataSource.getRepository(CustomerEntity);

  const nullOtpResult = await otpRepo.createQueryBuilder().delete().where('customerId IS NULL').execute();
  console.log('Deleted customer_otps with null customerId:', (nullOtpResult as any).affected || 0);

  const nullCustomerResult = await customerRepo.createQueryBuilder().delete().where('id IS NULL').execute();
  console.log('Deleted customers with null id:', (nullCustomerResult as any).affected || 0);

  const backfillResult = await customerRepo
    .createQueryBuilder()
    .update(CustomerEntity)
    .set({ id: () => "LPAD(floor(random() * 900000 + 100000)::text, 6, '0')" })
    .where('id IS NULL')
    .execute();
  console.log('Backfilled customer ids:', (backfillResult as any).affected || 0);

  await dataSource.destroy();
  console.log('Seed completed');
}

main().catch((err) => {
  console.error('Seed failed', err);
  process.exit(1);
});
