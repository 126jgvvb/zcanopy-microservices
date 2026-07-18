import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class NotificationEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  type!: string;

  @Column()
  channel!: string;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column()
  recipient!: string;

  @Column({ default: 'pending' })
  status!: string;

  @Column({ default: false })
  read!: boolean;

  @Column({ nullable: true })
  brokerCode?: string;

  @Column({ nullable: true })
  providerMessageId?: string;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
