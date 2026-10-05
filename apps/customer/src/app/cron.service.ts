import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerEntity } from './entity/customer.entity';

@Injectable()
export class CustomerCronService implements OnModuleInit {
  private readonly intervalMs: number;

  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
  ) {
    const hours = process.env.CUSTOMER_ACTIVITY_CRON_HOURS
      ? Number(process.env.CUSTOMER_ACTIVITY_CRON_HOURS)
      : 24;
    this.intervalMs = hours * 60 * 60 * 1000;
  }

  onModuleInit() {
    this.run().catch((err) => {
      console.error('[CustomerCron] Initial activity sync failed', err);
    });

    const timer = setInterval(() => {
      this.run().catch((err) => {
        console.error('[CustomerCron] Activity sync failed', err);
      });
    }, this.intervalMs);

    if (typeof (timer as any).unref === 'function') {
      (timer as any).unref();
    }
  }

  async run() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);

    const result = await this.customerRepo
      .createQueryBuilder()
      .update(CustomerEntity)
      .set({ isActive: false })
      .where('updatedAt <= :cutoff', { cutoff })
      .andWhere('isActive = :isActive', { isActive: true })
      .execute();

    const affected = (result as any)?.affected ?? 0;
    if (affected > 0) {
      console.log(`[CustomerCron] Deactivated ${affected} inactive customer(s)`);
    }
  }
}
