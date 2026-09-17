import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { CustomerEntity } from './customer.entity';

@Entity('customer_notifications')
export class CustomerNotificationEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column()
  title!: string;

  @Column('text')
  body!: string;

  @Column({ default: 'general' })
  type!: string;

  @Column({ default: false })
  isRead!: boolean;

  @Column({ nullable: true })
  dataJson!: string;

  @Column({ nullable: true })
  readAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => CustomerEntity, customer => customer.notifications, { onDelete: 'CASCADE' })
  customer!: CustomerEntity;

  @Column()
  customerId!: string;
}
