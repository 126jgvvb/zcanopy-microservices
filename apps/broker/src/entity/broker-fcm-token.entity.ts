import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class BrokerFcmTokenEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({default:''})
  brokerCode!: string;

  @Column({default:''})
  fcmToken!: string;

  @Column({ nullable: true })
  deviceId?: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ nullable: true })
  lastUsedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
