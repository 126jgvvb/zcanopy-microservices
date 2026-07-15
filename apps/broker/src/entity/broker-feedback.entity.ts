import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class BrokerFeedbackEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column()
  brokerCode!: string;

  @Column()
  brokerId!: string;

  @Column()
  email!: string;

  @Column()
  phone!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ default: 'pending' })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
